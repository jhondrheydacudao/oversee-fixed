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

// ------------------------- Buy Resources Route (RAM, CPU, Disk) -------------------------
router.get('/buyresource/:resource', isAuthenticated, async (req, res) => {
    try {
        const resource = req.params.resource;
        const coinsKey = `coins-${req.user.email}`;
        const resourcesKey = `resources-${req.user.email}`;

        const coins = (await db.get(coinsKey)) || 0;
        const userResources = (await db.get(resourcesKey)) || {};

        const prices = {
            ram: 150,  // Cost per 1GB RAM
            cpu: 200,  // Cost per 1 CPU core
            disk: 100  // Cost per 10GB Disk
        };

        const amounts = {
            ram: 1024,   // 1GB
            cpu: 1,      // 1 core
            disk: 10240  // 10GB
        };

        if (!prices[resource]) {
            return res.redirect('../store?err=INVALIDRESOURCE');
        }

        if (coins < prices[resource]) {
            return res.redirect('../store?err=NOTENOUGHCOINS');
        }

        // Add resource and deduct coins
        userResources[resource] = (userResources[resource] || 0) + amounts[resource];
        await db.set(resourcesKey, userResources);
        await db.set(coinsKey, coins - prices[resource]);

        return res.redirect(`../store?success=${resource.toUpperCase()}PURCHASED`);
    } catch (error) {
        console.error('Error processing buyresource request:', error);
        return res.redirect('../store?err=SERVERERROR');
    }
});

// ------------------------- Store Route -------------------------
router.get('/store', isAuthenticated, async (req, res) => {
    if (!req.user) return res.redirect('/');
    const email = req.user.email;
    const coinsKey = `coins-${email}`;

    let coins = await db.get(coinsKey);
  
    if (!coins) {
        coins = 0;
        await db.set(coinsKey, coins);
    }  
    res.render('store', {
        req,
        coins,
        user: req.user,
        users: await db.get('users') || [], 
        name: await db.get('name') || 'OverSee',
        logo: await db.get('logo') || false
    });
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
