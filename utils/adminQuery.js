const { paginatedResponse } = require("./responseHandler");
const { generalResponse } = require("../responses/common/general.response");

const buildPagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildNamedPagination = (query, prefix, defaultLimit = 10) => {
  const pageKey = `${prefix}Page`;
  const limitKey = `${prefix}Limit`;
  const page = Math.max(Number(query[pageKey]) || 1, 1);
  const limit = Math.min(Math.max(Number(query[limitKey]) || defaultLimit, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildPaginationMeta = ({ total, page, limit }) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalRecords: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
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

module.exports = { buildPagination, buildNamedPagination, buildPaginationMeta, sendPaginated };
