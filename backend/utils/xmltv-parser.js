/**
 * XMLTV EPG Parser
 *
 * Parses XMLTV format EPG data for TV Guide display
 * Uses non-blocking processing to avoid freezing the app
 */

const axios = require('axios');
const https = require('https');
const xml2js = require('xml2js');

/**
 * Yield to event loop - prevents blocking during large operations
 */
function yieldToEventLoop() {
    return new Promise(resolve => setImmediate(resolve));
}

// Create an https agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Parse XMLTV date format to JavaScript Date
 * XMLTV format: 20241210120000 +0000 or 20241210120000
 * @param {string} xmltvDate - Date string in XMLTV format
 * @returns {Date} JavaScript Date object
 */
function parseXMLTVDate(xmltvDate) {
    if (!xmltvDate) return null;

    // Remove timezone offset if present and extract just the date part
    const dateStr = xmltvDate.split(' ')[0];

    if (dateStr.length >= 14) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(dateStr.substring(8, 10));
        const minute = parseInt(dateStr.substring(10, 12));
        const second = parseInt(dateStr.substring(12, 14));

        return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    return null;
}

/**
 * Parse XMLTV EPG data from a string
 * Uses non-blocking processing to prevent app freezing on large files
 * @param {string} xmlContent - Raw XMLTV XML content
 * @param {number} daysToKeep - Number of days of EPG data to keep (default 7)
 * @returns {Promise<Object>} Parsed EPG data with channels and programs
 */
async function parseXMLTVFromString(xmlContent, daysToKeep = 7) {
    const bytesInMB = (xmlContent.length / 1024 / 1024).toFixed(2);
    console.log(`[EPG] Parsing XMLTV (${bytesInMB} MB)`);

    // Yield before heavy XML parsing
    await yieldToEventLoop();

    // Parse XML
    const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true
    });

    const result = await parser.parseStringPromise(xmlContent);

    // Yield after XML parsing completes
    await yieldToEventLoop();

    if (!result || !result.tv) {
        throw new Error('Invalid XMLTV format');
    }

    const tv = result.tv;

    // Parse channels
    const channels = {};
    const channelList = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);

    for (const ch of channelList) {
        const id = ch.id;
        const displayName = ch['display-name'];
        const icon = ch.icon;

        channels[id] = {
            id: id,
            name: Array.isArray(displayName) ? displayName[0] : (typeof displayName === 'object' ? displayName._ || displayName : displayName),
            logo: icon ? (icon.src || icon) : null
        };
    }

    console.log(`[EPG] Parsed ${Object.keys(channels).length} channels, processing programs...`);

    // Calculate time window for filtering
    const now = new Date();
    const cutoffStart = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 1 day ago
    const cutoffEnd = new Date(now.getTime() + (daysToKeep * 24 * 60 * 60 * 1000));
    const cutoffStartTs = cutoffStart.getTime();
    const cutoffEndTs = cutoffEnd.getTime();

    // Parse programs in batches to avoid blocking
    const programs = [];
    const programList = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);
    const BATCH_SIZE = 5000; // Process 5000 programs at a time before yielding

    for (let i = 0; i < programList.length; i++) {
        const prog = programList[i];
        const channelId = prog.channel;
        const start = parseXMLTVDate(prog.start);
        const stop = parseXMLTVDate(prog.stop);

        if (!start || !stop) continue;

        const startTs = start.getTime();
        const stopTs = stop.getTime();

        // Only keep programs within our time window
        if (stopTs < cutoffStartTs || startTs > cutoffEndTs) continue;

        const title = prog.title;
        const desc = prog.desc;
        const category = prog.category;

        programs.push({
            channel_id: channelId,
            start: start.toISOString(),
            stop: stop.toISOString(),
            start_timestamp: startTs,
            stop_timestamp: stopTs,
            title: Array.isArray(title) ? title[0] : (typeof title === 'object' ? title._ || title : title) || 'Unknown',
            description: Array.isArray(desc) ? desc[0] : (typeof desc === 'object' ? desc._ || desc : desc) || '',
            category: Array.isArray(category) ? category[0] : (typeof category === 'object' ? category._ || category : category) || ''
        });

        // Yield to event loop every BATCH_SIZE programs
        if (i > 0 && i % BATCH_SIZE === 0) {
            await yieldToEventLoop();
        }
    }

    console.log(`[EPG] Parsed ${Object.keys(channels).length} channels and ${programs.length} programs (${daysToKeep} day window)`);

    return {
        channels,
        programs,
        generated: new Date().toISOString()
    };
}

/**
 * Download and parse XMLTV EPG data
 * Uses non-blocking processing to prevent app freezing on large files
 * @param {string} url - EPG URL
 * @returns {Promise<Object>} Parsed EPG data with channels and programs
 */
async function parseXMLTVEPG(url) {
    try {
        console.log(`[EPG] Downloading XMLTV from: ${url}`);

        const response = await axios.get(url, {
            timeout: 120000, // 2 minute timeout for large files
            headers: {
                'User-Agent': 'StreamPanel/2.0'
            },
            maxContentLength: 100 * 1024 * 1024, // 100MB max
            httpsAgent: httpsAgent
        });

        const xmlContent = response.data;
        const bytesInMB = (xmlContent.length / 1024 / 1024).toFixed(2);
        console.log(`[EPG] Downloaded XMLTV (${bytesInMB} MB)`);

        // Yield before heavy XML parsing
        await yieldToEventLoop();

        // Parse XML
        const parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true
        });

        const result = await parser.parseStringPromise(xmlContent);

        // Yield after XML parsing
        await yieldToEventLoop();

        if (!result || !result.tv) {
            throw new Error('Invalid XMLTV format');
        }

        const tv = result.tv;

        // Parse channels
        const channels = {};
        const channelList = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);

        for (const ch of channelList) {
            const id = ch.id;
            const displayName = ch['display-name'];
            const icon = ch.icon;

            channels[id] = {
                id: id,
                name: Array.isArray(displayName) ? displayName[0] : (typeof displayName === 'object' ? displayName._ || displayName : displayName),
                logo: icon ? (icon.src || icon) : null
            };
        }

        console.log(`[EPG] Parsed ${Object.keys(channels).length} channels, processing programs...`);

        // Parse programs in batches to avoid blocking
        const programs = [];
        const programList = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);
        const BATCH_SIZE = 5000;

        for (let i = 0; i < programList.length; i++) {
            const prog = programList[i];
            const channelId = prog.channel;
            const start = parseXMLTVDate(prog.start);
            const stop = parseXMLTVDate(prog.stop);

            if (!start || !stop) continue;

            const title = prog.title;
            const desc = prog.desc;
            const category = prog.category;

            programs.push({
                channel_id: channelId,
                start: start.toISOString(),
                stop: stop.toISOString(),
                start_timestamp: start.getTime(),
                stop_timestamp: stop.getTime(),
                title: Array.isArray(title) ? title[0] : (typeof title === 'object' ? title._ || title : title) || 'Unknown',
                description: Array.isArray(desc) ? desc[0] : (typeof desc === 'object' ? desc._ || desc : desc) || '',
                category: Array.isArray(category) ? category[0] : (typeof category === 'object' ? category._ || category : category) || ''
            });

            // Yield to event loop every BATCH_SIZE programs
            if (i > 0 && i % BATCH_SIZE === 0) {
                await yieldToEventLoop();
            }
        }

        console.log(`[EPG] Parsed ${Object.keys(channels).length} channels and ${programs.length} programs`);

        return {
            channels,
            programs,
            generated: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[EPG] Failed to parse XMLTV:`, error.message);
        throw new Error(`Failed to parse EPG: ${error.message}`);
    }
}

/**
 * Get programs for a specific time range
 * @param {Array} programs - All programs
 * @param {Date} startTime - Range start
 * @param {Date} endTime - Range end
 * @returns {Array} Filtered programs
 */
function getProgramsInRange(programs, startTime, endTime) {
    const startTs = startTime.getTime();
    const endTs = endTime.getTime();

    return programs.filter(prog => {
        // Program overlaps with the time range
        return prog.start_timestamp < endTs && prog.stop_timestamp > startTs;
    });
}

/**
 * Get current program for a channel
 * @param {Array} programs - All programs
 * @param {string} channelId - Channel ID
 * @param {Date} now - Current time
 * @returns {Object|null} Current program or null
 */
function getCurrentProgram(programs, channelId, now = new Date()) {
    const nowTs = now.getTime();

    return programs.find(prog =>
        prog.channel_id === channelId &&
        prog.start_timestamp <= nowTs &&
        prog.stop_timestamp > nowTs
    ) || null;
}

/**
 * Organize programs by channel for TV guide grid
 * @param {Array} programs - All programs
 * @param {Object} channels - Channel map
 * @param {Date} startTime - Grid start time
 * @param {Date} endTime - Grid end time
 * @returns {Object} Programs organized by channel
 */
function organizeForGuideGrid(programs, channels, startTime, endTime) {
    const grid = {};
    const startTs = startTime.getTime();
    const endTs = endTime.getTime();

    // Initialize grid for each channel
    for (const channelId of Object.keys(channels)) {
        grid[channelId] = [];
    }

    // Populate programs
    for (const prog of programs) {
        if (!grid[prog.channel_id]) continue;

        // Check if program overlaps with our time range
        if (prog.start_timestamp < endTs && prog.stop_timestamp > startTs) {
            grid[prog.channel_id].push(prog);
        }
    }

    // Sort each channel's programs by start time
    for (const channelId of Object.keys(grid)) {
        grid[channelId].sort((a, b) => a.start_timestamp - b.start_timestamp);
    }

    return grid;
}

module.exports = {
    parseXMLTVEPG,
    parseXMLTVFromString,
    parseXMLTVDate,
    getProgramsInRange,
    getCurrentProgram,
    organizeForGuideGrid
};
