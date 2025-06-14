import { Request, Response, NextFunction } from 'express';
import { ValidationSchema } from 'class-validator'; // or your specific validation schema type
import { validationPipe } from '../utils/validation';
import { ValidationError } from 'class-validator';


const formatValidationErrors = (errors: ValidationError[]): { [key: string]: string } => {
  const formattedErrors: { [key: string]: string } = {};
  errors.forEach(error => {
    if (error.constraints) {
      formattedErrors[error.property] = Object.values(error.constraints).join(', ');
    }
  });

  return formattedErrors;
};



export const validationMiddleware = (validationSchema : new () => {}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors : ValidationError[] | null = await validationPipe(validationSchema, { ...req.body, ...req.params });
   
    if (errors) {
      const formattedErrors  = formatValidationErrors(errors);
      console.log(formattedErrors);
      res.status(400).json({
        success: false,
        message: {...formattedErrors},
      });
    } else {
      next();
    }
  };
};