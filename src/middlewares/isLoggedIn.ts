import {Express , Request , Response , NextFunction} from "express";
import { Unauthorized, UnauthorizedError } from "rest-api-errors";






export function isLoggedInMiddleware (req : Request, res : Response, next : NextFunction) {
  console.log(req.user)
  if(req.user){
    next();
  }else {
    throw new UnauthorizedError ('User is not authenticated');
  }
    /* res.status(401).json({
      message : "User is not authenticated",
    }) */
}