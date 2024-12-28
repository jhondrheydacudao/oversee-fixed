const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');
const config = require('../config.json');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const multer = require('multer');
const path = require('path')
const fs = require('node:fs')
const {logAudit} = require('../handlers/auditlog.js');
const nodemailer = require('nodemailer');
const { sendTestEmail } = require('../handlers/email.js');
const { isAuthenticated } = require('../handlers/auth.js');

router.get("/dashboard", isAuthenticated, async (req, res) => {
    if (!req.user) return res.redirect('/');
    let instances = [];

    if (req.query.see === "other") {
        let allInstances = await db.get('instances') || [];
        instances = allInstances.filter(instance => instance.User !== req.user.userId);
    } else {
        const userId = req.user.userId;
        const users = await db.get('users') || [];
        const authenticatedUser = users.find(user => user.userId === userId);
        instances = await db.get(req.user.userId + '_instances') || [];
        const subUserInstances = authenticatedUser.accessTo || [];
        for (const instanceId of subUserInstances) {
            const instanceData = await db.get(`${instanceId}_instance`);
            if (instanceData) {
                instances.push(instanceData);
            }
        }
    }
    const nodes = db.get('nodes');
    const images = db.get('images');
    res.render('dashboard', {
        req,
        user: req.user,
        name: await db.get('name') || 'HydraPanel',
        logo: await db.get('logo') || false,
        instances,
        nodes,
        images,
        config: require('../config.json')
    });
});

router.get("/create-server", isAuthenticated, async (req, res) => {
    if (!req.user) return res.redirect('/');
    let instances = [];

    try {
        if (req.query.see === "other") {
            let allInstances = await db.get('instances') || [];
            instances = allInstances.filter(instance => instance.User !== req.user.userId);
        } else {
            const userId = req.user.userId;
            const users = await db.get('users') || [];
            const authenticatedUser = users.find(user => user.userId === userId);
            instances = await db.get(req.user.userId + '_instances') || [];
            const subUserInstances = authenticatedUser?.accessTo || [];
            for (const instanceId of subUserInstances) {
                const instanceData = await db.get(`${instanceId}_instance`);
                if (instanceData) {
                    instances.push(instanceData);
                }
            }
        }

        // Fetch node IDs and retrieve corresponding node data
        const nodeIds = await db.get('nodes') || [];
        const nodes = [];
        for (const nodeId of nodeIds) {
            const nodeData = await db.get(`${nodeId}_node`);
            if (nodeData) {
                nodes.push(nodeData);
            }
        }

        // Fetch images
        const images = await db.get('images') || [];

        // Render the page
        res.render('create', {
            req,
            user: req.user,
            name: await db.get('name') || 'HydraPanel',
            logo: await db.get('logo') || false,
            instances,
            nodes,
            images,
            config: require('../config.json')
        });
    } catch (error) {
        console.error("Error fetching data for create-server:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/create', isAuthenticated, async (req, res) => {
  const { image, imageName, ram, cpu, ports, nodeId, name, user, primary, variables } =
    req.query;
  if (!imageName || !ram || !cpu || !ports || !nodeId || !name || !user || !primary) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    const Id = uuid().split('-')[0];
    const node = await db.get(`${nodeId}_node`);
    if (!node) {
      return res.status(400).json({ error: 'Invalid node' });
    }

    const requestData = await prepareRequestData(
      image,
      ram,
      cpu,
      ports,
      name,
      node,
      Id,
      variables,
      imageName,
    );
    const response = await axios(requestData);

    await updateDatabaseWithNewInstance(
      response.data,
      user,
      node,
      image,
      ram,
      cpu,
      ports,
      primary,
      name,
      Id,
      imageName,
    );

    logAudit(req.user.userId, req.user.username, 'instance:create', req.ip);
    res.redirect('../dashboard?err=CREATED');
  } catch (error) {
    console.error('Error deploying instance:', error);
    res.redirect('../create-server?err=INTERNALERROR')
  }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, Id, variables, imagename) {
  const rawImages = await db.get('images');
  const imageData = rawImages.find(i => i.Name === imagename);

  const requestData = {
    method: 'post',
    url: `http://${node.address}:${node.port}/instances/create`,
    auth: {
      username: 'Skyport',
      password: node.apiKey,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      Name: name,
      Id,
      Image: image,
      Env: imageData ? imageData.Env : undefined,
      Scripts: imageData ? imageData.Scripts : undefined,
      Memory: memory ? parseInt(memory) : undefined,
      Cpu: cpu ? parseInt(cpu) : undefined,
      ExposedPorts: {},
      PortBindings: {},
      variables,
      AltImages: imageData ? imageData.AltImages : [],
      StopCommand: imageData ? imageData.StopCommand : undefined,
      imageData,
    },
  };

  if (ports) {
    ports.split(',').forEach(portMapping => {
      const [containerPort, hostPort] = portMapping.split(':');

      // Adds support for TCP
      const tcpKey = `${containerPort}/tcp`;
      if (!requestData.data.ExposedPorts[tcpKey]) {
        requestData.data.ExposedPorts[tcpKey] = {};
      }

      if (!requestData.data.PortBindings[tcpKey]) {
        requestData.data.PortBindings[tcpKey] = [{ HostPort: hostPort }];
      }

      // Adds support for UDP
      const udpKey = `${containerPort}/udp`;
      if (!requestData.data.ExposedPorts[udpKey]) {
        requestData.data.ExposedPorts[udpKey] = {};
      }

      if (!requestData.data.PortBindings[udpKey]) {
        requestData.data.PortBindings[udpKey] = [{ HostPort: hostPort }];
      }
    });
  }

  return requestData;
}

async function updateDatabaseWithNewInstance(
  responseData,
  userId,
  node,
  image,
  memory,
  cpu,
  ports,
  primary,
  name,
  Id,
  imagename,
) {
  const rawImages = await db.get('images');
  const imageData = rawImages.find(i => i.Name === imagename);

  let altImages = imageData ? imageData.AltImages : [];

  const instanceData = {
    Name: name,
    Id,
    Node: node,
    User: userId,
    ContainerId: responseData.containerId,
    VolumeId: Id,
    Memory: parseInt(memory),
    Cpu: parseInt(cpu),
    Ports: ports,
    Primary: primary,
    Image: image,
    AltImages: altImages,
    StopCommand: imageData ? imageData.StopCommand : undefined,
    imageData,
    Env: responseData.Env,
  };

  const userInstances = (await db.get(`${userId}_instances`)) || [];
  userInstances.push(instanceData);
  await db.set(`${userId}_instances`, userInstances);

  const globalInstances = (await db.get('instances')) || [];
  globalInstances.push(instanceData);
  await db.set('instances', globalInstances);

  await db.set(`${Id}_instance`, instanceData);
}

module.exports = router;