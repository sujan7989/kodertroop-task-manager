import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface Task {
  title: string;
  description: string;
  completed: boolean;
  userId: Types.ObjectId;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDocument extends Task, Document {
  _id: Types.ObjectId;
}

const taskSchema = new Schema<TaskDocument>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [120, 'Title must be at most 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [3, 'Description must be at least 3 characters'],
      maxlength: [2000, 'Description must be at most 2000 characters'],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    dueDate: {
      type: Date,
      required: false,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ userId: 1, createdAt: -1 });

export const TaskModel: Model<TaskDocument> =
  mongoose.models.Task ?? mongoose.model<TaskDocument>('Task', taskSchema);
