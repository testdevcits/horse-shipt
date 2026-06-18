const { generalResponse } = require("../responses/common/general.response");

const successResponse = (
  res,
  statusCode = 200,
  message = generalResponse.SUCCESS,
  data = {},
  meta = {}
) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    ...meta,
  });

const errorResponse = (
  res,
  statusCode = 500,
  message = generalResponse.SOMETHING_WENT_WRONG,
  errors = {}
) =>
  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });

const paginatedResponse = (
  res,
  {
    data,
    total,
    page,
    limit,
    message = generalResponse.FETCHED_SUCCESSFULLY,
    meta = {},
  }
) =>
  successResponse(res, 200, message, data, {
    count: data.length,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    ...meta,
  });

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
};
