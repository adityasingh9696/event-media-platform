import { PrismaClient, Role, ClubRole, EventCategory, Visibility } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Seeding database...');

  // 1. Clean existing data
  await prisma.watermarkConfig.deleteMany();
  await prisma.clubMember.deleteMany();
  await prisma.photoPerson.deleteMany();
  await prisma.mediaTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.media.deleteMany();
  await prisma.album.deleteMany();
  await prisma.event.deleteMany();
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();

  console.info('🗑️  Existing data cleared');

  // 2. Hash passwords
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  // 3. Create Users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      username: 'admin',
      displayName: 'Admin User',
      passwordHash,
      role: Role.admin,
    },
  });

  const photographerUser = await prisma.user.create({
    data: {
      email: 'photo@demo.com',
      username: 'photographer',
      displayName: 'Alex Shot',
      passwordHash,
      role: Role.photographer,
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      email: 'member@demo.com',
      username: 'member',
      displayName: 'Jane Doe',
      passwordHash,
      role: Role.club_member,
    },
  });

  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@demo.com',
      username: 'viewer',
      displayName: 'John Smith',
      passwordHash,
      role: Role.viewer,
    },
  });

  console.info('👤 Users created');

  // 4. Create Club
  const club = await prisma.club.create({
    data: {
      name: 'Pixel Society',
      slug: 'pixel-society',
      description: 'The flagship photography and media club of the university.',
      logoUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=150&h=150&fit=crop',
    },
  });

  console.info('🏢 Club created');

  // 5. Create Club Memberships
  await prisma.clubMember.createMany({
    data: [
      { userId: adminUser.id, clubId: club.id, role: ClubRole.admin },
      { userId: photographerUser.id, clubId: club.id, role: ClubRole.photographer },
      { userId: memberUser.id, clubId: club.id, role: ClubRole.member },
      { userId: viewerUser.id, clubId: club.id, role: ClubRole.viewer },
    ],
  });

  console.info('👥 Club memberships linked');

  // 6. Create Watermark Config
  await prisma.watermarkConfig.create({
    data: {
      clubId: club.id,
      includeClubName: true,
      includeEventName: true,
      includeUserRole: true,
      includeTimestamp: true,
      memberOpacity: 0.5,
      adminOpacity: 0.3,
      memberDiagonal: true,
      adminDiagonal: false,
      position: 'southeast',
    },
  });

  console.info('📐 Watermark configurations initialized');

  // 7. Create Events
  const event1 = await prisma.event.create({
    data: {
      name: 'Annual Trek 2025',
      description: 'Adventure photoshoot and nature trekking event in the hills.',
      category: EventCategory.trip,
      date: new Date('2025-09-12'),
      location: 'Mountain Trail Peaks',
      visibility: Visibility.public,
      clubId: club.id,
      coverImageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    },
  });

  const event2 = await prisma.event.create({
    data: {
      name: 'Freshers Night 2025',
      description: 'Welcome party and cultural celebrations for the new batch.',
      category: EventCategory.cultural,
      date: new Date('2025-10-05'),
      location: 'Main Auditorium',
      visibility: Visibility.public,
      clubId: club.id,
      coverImageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
    },
  });

  const event3 = await prisma.event.create({
    data: {
      name: 'Sports Day 2025',
      description: 'Action photography at the university annual athletics and sports meet.',
      category: EventCategory.competition,
      date: new Date('2025-11-20'),
      location: 'University Stadium',
      visibility: Visibility.public,
      clubId: club.id,
      coverImageUrl: 'https://images.unsplash.com/photo-1502012658159-0ae1fa59bc70?w=800&q=80',
    },
  });

  console.info('📅 Events created');

  // 8. Create Albums per event
  // Event 1
  const album1a = await prisma.album.create({
    data: {
      name: 'Summit Sunrise',
      description: 'Landscapes and group shots from the early morning summit reach.',
      eventId: event1.id,
      visibility: Visibility.public,
    },
  });
  const album1b = await prisma.album.create({
    data: {
      name: 'Trail Path Candid',
      description: 'Candid hiking portraits and action walks.',
      eventId: event1.id,
      visibility: Visibility.club_only,
    },
  });

  // Event 2
  const album2a = await prisma.album.create({
    data: {
      name: 'Stage Performances',
      description: 'Cultural dance, music, and main events on stage.',
      eventId: event2.id,
      visibility: Visibility.public,
    },
  });
  const album2b = await prisma.album.create({
    data: {
      name: 'Red Carpet & Backdrop',
      description: 'Portraits at the photobooth entry.',
      eventId: event2.id,
      visibility: Visibility.public,
    },
  });

  // Event 3
  const album3a = await prisma.album.create({
    data: {
      name: 'Track & Field Action',
      description: 'High-speed action shots of sprints, relays, and jumps.',
      eventId: event3.id,
      visibility: Visibility.public,
    },
  });
  const album3b = await prisma.album.create({
    data: {
      name: 'Ceremonies & Awards',
      description: 'Medal distributions, celebrations, and team podiums.',
      eventId: event3.id,
      visibility: Visibility.public,
    },
  });

  console.info('🗂️  Albums created');

  // 9. Initial Tags
  const defaultTags = ['nature', 'portrait', 'sports', 'party', 'celebration', 'candid', 'sunset', 'action'];
  for (const name of defaultTags) {
    await prisma.tag.create({
      data: { name },
    });
  }

  console.info('🏷️  Default tags initialized');
  console.info('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
