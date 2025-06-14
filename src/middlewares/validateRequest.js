import { StatusCodes } from 'http-status-codes';

/**
 * Creates a validation middleware for the given schema
 * 
 * @param {Object} schema - The Joi schema to validate against
 * @param {String} property - The request property to validate (body, params, query)
 * @returns {Function} Express middleware function
 */
export const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown properties
      errors: {
        wrap: {
          label: false // Don't wrap error labels
        }
      }
    });

    // If validation passes, replace req[property] with validated value
    // This ensures type coercion and default values are applied
    if (!error) {
      req[property] = value;
      return next();
    }

    // Format errors for consistent API responses
    const errorDetails = error.details.map(detail => ({
      path: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(StatusCodes.BAD_REQUEST).json({
      status: 'error',
      message: 'Validation error',
      errors: errorDetails
    });
  };
};