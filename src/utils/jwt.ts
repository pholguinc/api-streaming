import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface JwtPayload {
  id: string;
  role: string;
  metroUsername: string | null;
  displayName: string;
  avatar: string | null;
  iat?: number;
  exp?: number;
}

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};
