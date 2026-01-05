/**
 * Jobs Routes
 *
 * API routes for checking background job status
 */

const express = require('express');
const jobProcessor = require('../services/JobProcessor');

const router = express.Router();

/**
 * GET /api/v2/jobs/:jobId
 * Get job status by ID
 */
router.get('/:jobId', (req, res) => {
    try {
        const { jobId } = req.params;

        const status = jobProcessor.getJobStatus(jobId);

        if (!status.success) {
            return res.status(404).json(status);
        }

        res.json(status);

    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job status',
            error: error.message
        });
    }
});

module.exports = router;
