const buildPagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const sendPaginated = (res, { data, total, page, limit }) =>
  res.status(200).json({
    success: true,
    message: "Data fetched successfully",
    count: data.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    data,
  });

module.exports = { buildPagination, sendPaginated };
