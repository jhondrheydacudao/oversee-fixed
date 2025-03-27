const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const axios = require('axios');
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { logAudit } = require('../handlers/auditlog.js');
const { sendTestEmail } = require('../handlers/email.js');
const { isAuthenticated } = require('../handlers/auth.js');
const { db } = require('../handlers/db.js');
const config = require('../config.json');

const saltRounds = 10;

// ------------------------- Dashboard Route -------------------------
router.get("/dashboard", isAuthenticated, async (req, res) => {
    if (!req.user) return res.redirect('/');

    try {
        let instances = [];
        const userId = req.user.userId;
        const users = await db.get('users') || [];
        const authenticatedUser = users.find(user => user.userId === userId);
        
        if (req.query.see === "other") {
            instances = (await db.get('instances'))?.filter(instance => instance.User !== userId) || [];
        } else {
            instances = await db.get(`${userId}_instances`) || [];
            for (const instanceId of (authenticatedUser?.accessTo || [])) {
                const instanceData = await db.get(`${instanceId}_instance`);
                if (instanceData) instances.push(instanceData);
            }
        }

        // Fetch announcement
        const announcement = await db.get('announcement') || {
            title: 'Change me',
            description: 'Change me from admin settings',
            type: 'warn'
        };

        await db.set('announcement', announcement);

        // Fetch user resources
        const max_resources = await db.get(`resources-${req.user.email}`) || config.total_resources;

        res.render('dashboard', {
            req,
            user: req.user,
            name: await db.get('name') || 'OverSee',
            logo: await db.get('logo') || false,
            instances,
            nodes: await db.get('nodes') || [],
            images: await db.get('images') || [],
            max_resources,
            announcement,
            config
        });

    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).send("Internal Server Error");
    }
});

// ------------------------- WebSocket AFK Path -------------------------
router.ws('/afkwspath', async (ws, req) => {
    if (!req.user || !req.user.email || !req.user.userId) {
        console.error('WebSocket connection failed: Missing user data.');
        return ws.close();
    }

    const earners = {};
    const timeConf = parseInt(process.env.AFK_TIME || "60");
    let time = timeConf;

    if (earners[req.user.email]) {
        console.error(`User ${req.user.email} is already earning.`);
        return ws.close();
    }

    earners[req.user.email] = true;
    const interval = setInterval(async () => {
        if (time-- <= 0) {
            time = timeConf;
            ws.send(JSON.stringify({ type: "coin" }));
            const coins = (await db.get(`coins-${req.user.email}`)) || 0;
            await db.set(`coins-${req.user.email}`, coins + 5);
        }
        ws.send(JSON.stringify({ type: "count", amount: time }));
    }, 1000);

    ws.on('close', () => {
        delete earners[req.user.email];
        clearInterval(interval);
    });
});

// ------------------------- Create Server Route -------------------------
router.get("/create-server", isAuthenticated, async (req, res) => {
    if (!req.user) return res.redirect('/');

    try {
        const userId = req.user.userId;
        const users = await db.get('users') || [];
        const authenticatedUser = users.find(user => user.userId === userId);
        let instances = await db.get(`${userId}_instances`) || [];

        for (const instanceId of (authenticatedUser?.accessTo || [])) {
            const instanceData = await db.get(`${instanceId}_instance`);
            if (instanceData) instances.push(instanceData);
        }

        res.render('create', {
            req,
            user: req.user,
            name: await db.get('name') || 'OverSee',
            logo: await db.get('logo') || false,
            instances,
            nodes: await db.get('nodes') || [],
            images: await db.get('images') || [],
            config
        });

    } catch (error) {
        console.error('Error loading create-server page:', error);
        res.status(500).send("Internal Server Error");
    }
});

// ------------------------- Create Instance -------------------------
router.get('/create', isAuthenticated, async (req, res) => {
    try {
        const { imageName, ram, cpu, ports, nodeId, name, user, primary } = req.query;
        if (!imageName || !ram || !cpu || !ports || !nodeId || !name || !user || !primary) {
            return res.redirect('../create-server?err=MISSINGFIELDS');
        }

        const requestedRam = parseInt(ram, 10);
        const requestedCore = parseInt(cpu, 10);
        const user_resources = await db.get(`resources-${req.user.email}`) || config.total_resources;

        if (requestedRam > user_resources.ram || requestedCore > user_resources.cores) {
            return res.redirect('../create-server?err=NOT_ENOUGH_RESOURCES');
        }

        const Id = uuid().split('-')[0];
        const node = await db.get(`${nodeId}_node`);
        if (!node) return res.status(400).json({ error: 'Invalid node' });

        const response = await axios({
            method: 'post',
            url: `http://${node.address}:${node.port}/instances/create`,
            auth: { username: 'Skyport', password: node.apiKey },
            headers: { 'Content-Type': 'application/json' },
            data: { Name: name, Id, Memory: requestedRam, Cpu: requestedCore, Ports: ports }
        });

        const newResources = {
            ram: user_resources.ram - requestedRam,
            cores: user_resources.cores - requestedCore
        };

        await db.set(`resources-${req.user.email}`, newResources);
        await db.set(`${Id}_instance`, {
            Name: name, Id, Node: node, User: user, ContainerId: response.data.containerId,
            Memory: requestedRam, Cpu: requestedCore, Ports: ports, Primary: primary, Image: imageName
        });

        logAudit(req.user.userId, req.user.username, 'instance:create', req.ip);
        res.redirect('../dashboard?err=CREATED');
    } catch (error) {
        console.error('Error creating instance:', error);
        res.redirect('../create-server?err=INTERNALERROR');
    }
});

// ------------------------- Delete Instance -------------------------
router.get('/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const instance = await db.get(`${id}_instance`);
        if (!instance || instance.User !== req.user.userId) return res.redirect('/dashboard?err=DO_NOT_OWN');

        await axios.get(`http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/delete`);
        await db.delete(`${id}_instance`);

        res.redirect('/dashboard?err=DELETED');
    } catch (error) {
        console.error('Error deleting instance:', error);
        res.redirect('/dashboard?err=ERROR');
    }
});

module.exports = router;
