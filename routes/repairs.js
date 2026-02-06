const express = require('express');
const router = express.Router();
const Repair = require('../models/Repair');

// Get all repairs
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};

    if (status) query.status = status;

    const repairs = await Repair.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: repairs.length, data: repairs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single repair
router.get('/:id', async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create repair
router.post('/', async (req, res) => {
  try {
    const repair = await Repair.create(req.body);
    res.status(201).json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update repair status
router.put('/:id', async (req, res) => {
  try {
    const { status, notes, estimatedCost } = req.body;
    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      { status, notes, estimatedCost },
      { new: true }
    );

    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete repair
router.delete('/:id', async (req, res) => {
  try {
    const repair = await Repair.findByIdAndDelete(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, message: 'Repair deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
