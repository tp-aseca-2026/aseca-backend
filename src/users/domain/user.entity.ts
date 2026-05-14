export type User = {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  id: number;
  email: string;
  createdAt: Date;
};
