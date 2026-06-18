const { paginatedResponse } = require("./responseHandler");
const { generalResponse } = require("../responses/common/general.response");

const buildPagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const sendPaginated = (res, { data, total, page, limit, meta = {}, message }) =>
  paginatedResponse(res, {
    data,
    total,
    page,
    limit,
    meta,
    message: message || generalResponse.FETCHED_SUCCESSFULLY,
  });

module.exports = { buildPagination, sendPaginated };
