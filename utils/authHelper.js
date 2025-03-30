const { db } = require('../handlers/db.js');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

/**
 * Checks if the user is authorized to access the specified container ID.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} containerId - The container ID to check authorization for.
 * @returns {Promise<boolean>} True if the user is authorized, otherwise false.
 */
async function isUserAuthorizedForContainer(userId, containerId) {
    try {
        const [userInstances, users] = await Promise.all([
            db.get(userId + '_instances') || [],
            db.get('users') || []
        ]);

        const user = users.find(user => user.userId === userId);
        if (!user) {
            log.error(`User not found: ${userId}`);
            return false;
        }

        if (user.admin) {
            return true;
        }

        const subUserInstances = user.accessTo || [];
        const isInSubUserInstances = subUserInstances.includes(containerId);
        const isInUserInstances = userInstances.some(instance => instance.Id === containerId);

        if (isInSubUserInstances || isInUserInstances) {
            return true;
        } else {
            log.error(`User not authorized for container: ${containerId}`);
            return false;
        }
    } catch (error) {
        log.error(`Error fetching user instances for userId ${userId}:`, error);
        return false;
    }
}

/**
 * Checks if the instance is suspended.
 * @param {string} instanceId - The unique identifier of the instance.
 * @returns {Promise<boolean>} True if the instance is suspended, otherwise false.
 */
async function isInstanceSuspended(instanceId) {
    try {
        let instance = await db.get(`${instanceId}_instance`);

        if (!instance) {
            instance = { suspended: false };
            await db.set(`${instanceId}_instance`, instance);
        }

        if (instance.suspended) {
            return true; // Instead of redirecting, return true indicating suspension
        }

        if (typeof instance.suspended === 'undefined') {
            instance.suspended = false;
            await db.set(`${instanceId}_instance`, instance);
        }

        return false;
    } catch (error) {
        log.error(`Error checking suspension status for instanceId ${instanceId}:`, error);
        return false;
    }
}

module.exports = {
    isUserAuthorizedForContainer,
    isInstanceSuspended
};
