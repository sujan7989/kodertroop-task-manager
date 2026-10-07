import mongoose, { Schema, Document, Model } from 'mongoose';

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument extends User, Document {
  _id: mongoose.Types.ObjectId;
}

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      maxlength: [254, 'Email must be at most 254 characters'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if ('passwordHash' in ret) delete ret.passwordHash;
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if ('passwordHash' in ret) delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const UserModel: Model<UserDocument> =
  mongoose.models.User ?? mongoose.model<UserDocument>('User', userSchema);
