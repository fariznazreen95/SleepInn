import { faker } from '@faker-js/faker';
import { client, db } from './db';
import { users, listings, photos } from './schema';

async function main() {
  await client.connect();

  // start clean for dev runs
  await db.execute(`delete from photos; delete from listings; delete from users;`);

  // create one host user
  const [host] = await db.insert(users).values({
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName()
  }).returning();
  const hostId = (host as any).id as number;

  // 12 listings
  for (let i = 0; i < 12; i++) {
    const city = faker.location.city();
    const country = faker.location.country();

    const [l] = await db.insert(listings).values({
      title: `${faker.word.adjective()} ${faker.word.noun()} in ${city}`,
      description: faker.lorem.sentences({ min: 2, max: 4 }),
      pricePerNight: faker.number.int({ min: 80, max: 480 }).toString(), // keep as string for numeric column
      city, country,
      beds: faker.number.int({ min: 1, max: 5 }),
      baths: faker.number.int({ min: 1, max: 3 }),
      isInstantBook: faker.datatype.boolean(),
      hostId
    }).returning();

    const listingId = (l as any).id as number;

    // 3 photos per listing (placeholder images)
    for (let p = 0; p < 3; p++) {
      await db.insert(photos).values({
        listingId,
        url: `https://picsum.photos/seed/${listingId}-${p}/640/420`,
        alt: `Photo ${p+1}`
      });
    }
  }

  await client.end();
  console.log('✅ Seeded 12 listings + photos');
}

main().catch(async (e) => {
  console.error(e);
  try { await client.end(); } catch {}
  process.exit(1);
});
