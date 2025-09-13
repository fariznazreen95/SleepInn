import { faker } from "@faker-js/faker";
import { db, pool } from "./db";            // ✅ use db + pool (no client)
import { users, listings, photos } from "./schema";

async function main() {
  // start clean for dev runs
  await db.delete(photos);
  await db.delete(listings);
  await db.delete(users);

  // create one host user
  const [host] = await db.insert(users).values({
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
  }).returning();
  const hostId = (host as any).id as number;

  // 12 listings
  for (let i = 0; i < 12; i++) {
    const city = faker.location.city();
    const country = faker.location.country();

    const [l] = await db.insert(listings).values({
      title: `${faker.word.adjective()} ${faker.word.noun()} in ${city}`,
      description: faker.lorem.sentences({ min: 2, max: 4 }),
      pricePerNight: faker.number.int({ min: 80, max: 480 }).toString(), // string in DB
      city,
      country,
      beds: faker.number.int({ min: 1, max: 5 }),
      baths: faker.number.int({ min: 1, max: 3 }),
      isInstantBook: faker.datatype.boolean(),
      hostId,
    }).returning();

    const listingId = (l as any).id as number;

    // 3 photos per listing
    for (let p = 0; p < 3; p++) {
      await db.insert(photos).values({
        listingId,
        url: `https://picsum.photos/seed/${listingId}-${p}/640/420`,
        alt: `Photo ${p + 1}`,
      });
    }
  }

  console.log("✅ Seeded 12 listings + photos");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch {}
  });
