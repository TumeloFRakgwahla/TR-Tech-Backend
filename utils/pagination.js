const sendPaginated = (res, items, total, page, limit) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const totalPages = Math.ceil(total / limitNum);

  res.json({
    success: true,
    count: items.length,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
    data: items,
  });
};

module.exports = { sendPaginated };
