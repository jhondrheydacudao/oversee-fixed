const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');
const config = require('../config.json');
const { isAuthenticated } = require('../handlers/auth.js');
const { logAudit } = require('../handlers/auditlog.js');

router.get("/dashboard", isAuthenticated, async (req, res) => {
    try {
        if (!req.user) return res.redirect('/');

        const userId = req.user.userId;
        let instances = await db.get(`${userId}_instances`) || [];

        const users = await db.get('users') || [];
        const authenticatedUser = users.find(user => user.userId === userId);
        if (authenticatedUser?.accessTo) {
            for (const instanceId of authenticatedUser.accessTo) {
                const instanceData = await db.get(`${instanceId}_instance`);
                if (instanceData) instances.push(instanceData);
            }
        }

        const announcement = await db.get('announcement') || {
            title: 'Change me',
            description: 'Change me from admin settings',
            type: 'warn'
        };

        const resourcesKey = `resources-${req.user.email}`;
        let max_resources = await db.get(resourcesKey);
        if (!max_resources) {
            max_resources = { ...config.total_resources };
            await db.set(resourcesKey, max_resources);
        }

        res.render('dashboard', {
            req,
            user: req.user,
            name: await db.get('name') || 'OverSee',
            logo: await db.get('logo') || false,
            instances,
            nodes: await db.get('nodes') || [],
            max_resources,
            images: await db.get('images') || [],
            announcement,
            config
        });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.get("/create-server", isAuthenticated, async (req, res) => {
    try {
        if (!req.user) return res.redirect('/');

        const userId = req.user.userId;
        let instances = await db.get(`${userId}_instances`) || [];

        const users = await db.get('users') || [];
        const authenticatedUser = users.find(user => user.userId === userId);
        if (authenticatedUser?.accessTo) {
            for (const instanceId of authenticatedUser.accessTo) {
                const instanceData = await db.get(`${instanceId}_instance`);
                if (instanceData) instances.push(instanceData);
            }
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
        console.error("Error loading create-server:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.get("/create", isAuthenticated, async (req, res) => {
    try {
        const { imageName, ram, cpu, disk, ports, nodeId, name, user, primary } = req.query;
        if (!imageName || !ram || !cpu || !disk || !ports || !nodeId || !name || !user || !primary) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const requestedRam = parseInt(ram, 10);
        const requestedCpu = parseInt(cpu, 10);
        const requestedDisk = parseInt(disk, 10);

        const resourcesKey = `resources-${req.user.email}`;
        let userResources = await db.get(resourcesKey);
        if (!userResources || requestedRam > userResources.ram || requestedCpu > userResources.cores || requestedDisk > userResources.disk) {
            return res.redirect('../create-server?err=NOT_ENOUGH_RESOURCES');
        }

        const node = await db.get(`${nodeId}_node`);
        if (!node) return res.status(400).json({ error: 'Invalid node' });

        const instanceId = uuid().split('-')[0];
        const requestData = {
            method: 'post',
            url: `http://${node.address}:${node.port}/instances/create`,
            auth: { username: 'Skyport', password: node.apiKey },
            headers: { 'Content-Type': 'application/json' },
            data: { Name: name, Id: instanceId, Image: imageName, Memory: requestedRam, Cpu: requestedCpu, Disk: requestedDisk, ExposedPorts: {}, PortBindings: {}, variables: {} }
        };

        const response = await axios(requestData);

        userResources.ram -= requestedRam;
        userResources.cores -= requestedCpu;
        userResources.disk -= requestedDisk;
        await db.set(resourcesKey, userResources);

        await db.set(`${instanceId}_instance`, { ...response.data, User: req.user.userId });
        res.redirect('../dashboard?err=CREATED');
    } catch (error) {
        console.error("Error creating server:", error);
        res.redirect('../create-server?err=INTERNALERROR');
    }
});

router.get('/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.redirect('/dashboard');

        const instance = await db.get(`${id}_instance`);
        if (!instance || instance.User !== req.user.userId) {
            return res.redirect('/dashboard?err=DO_NOT_OWN');
        }

        const resourcesKey = `resources-${req.user.email}`;
        let userResources = await db.get(resourcesKey);
        if (userResources) {
            userResources.ram += instance.Memory;
            userResources.cores += instance.Cpu;
            userResources.disk += instance.Disk;
            await db.set(resourcesKey, userResources);
        }

        await axios.get(`http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/delete`);
        await db.delete(`${id}_instance`);
        res.redirect('/dashboard?err=DELETED');
    } catch (error) {
        console.error("Error deleting instance:", error);
        res.redirect('/dashboard?err=ERROR');
    }
});

router.get('/buyresource/:resource', isAuthenticated, async (req, res) => {
    try {
        const resource = req.params.resource;
        const coinsKey = `coins-${req.user.email}`;
        const resourcesKey = `resources-${req.user.email}`;

        let coins = await db.get(coinsKey) || 0;
        let userResources = await db.get(resourcesKey) || { ram: 0, cores: 0, disk: 0 };

        const prices = { ram: 400, cpu: 300, disk: 400 };
        if (!prices[resource] || coins < prices[resource]) {
            return res.redirect('../store?err=NOTENOUGHCOINS');
        }

        userResources[resource] += resource === 'cpu' ? 1 : 1024;
        await db.set(resourcesKey, userResources);
        await db.set(coinsKey, coins - prices[resource]);

        res.redirect('../store?success=PURCHASED');
    } catch (error) {
        console.error("Error processing buyresource:", error);
        res.redirect('../store?err=SERVERERROR');
    }
});

module.exports = router;
