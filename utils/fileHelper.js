const axios = require('axios');

// Utility function to create the URL
function createURL(instance, endpoint, filename = '', path = '') {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files${endpoint}${filename}${query}`;
}

/**
 * Fetches files for a given instance.
 * @param {Object} instance - The instance object.
 * @param {string} path - The path to fetch files from.
 * @returns {Promise<Array>} - The list of files.
 */
async function fetchFiles(instance, path = '') {
    const url = createURL(instance, '', '', path);
    try {
        const response = await axios.get(url, {
            auth: {
                username: process.env.SKYPORT_USERNAME || 'Skyport',
                password: instance.Node.apiKey
            }
        });
        return response.data.files || [];
    } catch (error) {
        console.error('Error fetching files:', error);
        return [];
    }
}

/**
 * Fetches content of a specific file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to fetch.
 * @param {string} path - The path of the file.
 * @returns {Promise<string>} - The content of the file.
 */
async function fetchFileContent(instance, filename, path = '') {
    const url = createURL(instance, '/view/', filename, path);
    try {
        const response = await axios.get(url, {
            auth: {
                username: process.env.SKYPORT_USERNAME || 'Skyport',
                password: instance.Node.apiKey
            }
        });
        return response.data.content;
    } catch (error) {
        console.error('Error fetching file content:', error);
        return null;
    }
}

/**
 * Creates a new file on the HydraDaemon.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to create.
 * @param {string} content - The content of the file.
 * @param {string} path - The path where to create the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function createFile(instance, filename, content, path = '') {
    const url = createURL(instance, '/create/', filename, path);
    try {
        const response = await axios.post(url, { content }, {
            auth: {
                username: process.env.SKYPORT_USERNAME || 'Skyport',
                password: instance.Node.apiKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating file:', error);
        return null;
    }
}

/**
 * Edits an existing file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to edit.
 * @param {string} content - The new content of the file.
 * @param {string} path - The path of the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function editFile(instance, filename, content, path = '') {
    const url = createURL(instance, '/edit/', filename, path);
    try {
        const response = await axios.post(url, { content }, {
            auth: {
                username: process.env.SKYPORT_USERNAME || 'Skyport',
                password: instance.Node.apiKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error editing file:', error);
        return null;
    }
}

/**
 * Deletes a file.
 * @param {Object} instance - The instance object.
 * @param {string} filename - The name of the file to delete.
 * @param {string} path - The path of the file.
 * @returns {Promise<Object>} - The response from the server.
 */
async function deleteFile(instance, filename, path = '') {
    const url = createURL(instance, '/delete/', filename, path);
    try {
        const response = await axios.delete(url, {
            auth: {
                username: process.env.SKYPORT_USERNAME || 'Skyport',
                password: instance.Node.apiKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error deleting file:', error);
        return null;
    }
}

module.exports = {
    fetchFiles,
    fetchFileContent,
    createFile,
    editFile,
    deleteFile
};
