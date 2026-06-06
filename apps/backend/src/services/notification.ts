import { prisma } from '../lib/prisma';
import { emitToUser } from '../lib/socket';
import { NotificationType } from '@prisma/client';

interface CreateNotificationParams {
  type: NotificationType;
  recipientId: string;
  senderId?: string | null;
  message: string;
  metadata?: Record<string, any> | null;
}

export async function createNotification(params: CreateNotificationParams) {
  const { type, recipientId, senderId, message, metadata } = params;

  // Don't send notifications to yourself
  if (senderId && recipientId === senderId) {
    return null;
  }

  // Create notification in database
  const notification = await prisma.notification.create({
    data: {
      type,
      recipientId,
      senderId: senderId || null,
      message,
      metadata: metadata || undefined,
    },
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Emit to user over socket.io in real-time
  try {
    emitToUser(recipientId, 'notification:received', notification);
  } catch (err) {
    console.warn(`Failed to emit notification to user ${recipientId} via socket.io`, err);
  }

  return notification;
}
