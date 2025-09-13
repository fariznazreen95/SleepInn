import { faker } from "@faker-js/faker";
import { db, pool } from "./db";
import { users, listings, photos } from "./schema";
import { sql } from "drizzle-orm";

// Hard reset tables and restart identity so ids start from 1 again
async function reset() {
  await db.execute(
    sql`TRUNCATE TABLE photos, listings, users RESTART IDENTITY CASCADE;`
  );
}

async function addListing(
  hostId: number,
  opts: {
    title: string;
    city: string;
    country: string;
    price: number;
    beds: number;
    baths: number;
    instant: boolean;
    desc?: string;
    photoSeeds?: string[];
  }
) {
  const [l] = await db
    .insert(listings)
    .values({
      title: opts.title,
      description:
        opts.desc ?? faker.lorem.sentences({ min: 2, max: 4 }),
      pricePerNight: String(opts.price), // schema uses camelCase; DB column is text
      city: opts.city,
      country: opts.country,
      beds: opts.beds,
      baths: opts.baths,
      isInstantBook: opts.instant,
      hostId,
    })
    .returning();

  const listingId = (l as any).id as number;
  const seeds = opts.photoSeeds?.length ? opts.photoSeeds : ["a", "b", "c"];

  for (let i = 0; i < seeds.length; i++) {
    await db.insert(photos).values({
      listingId,
      url: `https://picsum.photos/seed/${opts.city.replace(/\s+/g, "-")}-${listingId}-${seeds[i]}/640/420`,
      alt: `Photo ${i + 1}`,
    });
  }
}

async function main() {
  await reset();

  // single host
  const [host] = await db
    .insert(users)
    .values({
      email: faker.internet.email().toLowerCase(),
      name: faker.person.fullName(),
    })
    .returning();
  const hostId = (host as any).id as number;

  // ---- Curated Malaysia listings (guaranteed to exist) ----
  await addListing(hostId, {
    title: "Comfy Studio near KLCC",
    city: "Kuala Lumpur",
    country: "Malaysia",
    price: 199,
    beds: 1,
    baths: 1,
    instant: true,
    desc: "Walk to KLCC. Cozy, bright, perfect for solo/business.",
    photoSeeds: ["klcc1", "klcc2", "klcc3"],
  });

  await addListing(hostId, {
    title: "Minimalist Loft @ Bangsar",
    city: "Kuala Lumpur",
    country: "Malaysia",
    price: 280,
    beds: 2,
    baths: 1,
    instant: true,
    desc: "Loft vibes. Cafes downstairs. Fast Wi-Fi.",
    photoSeeds: ["bangsar1", "bangsar2", "bangsar3"],
  });

  await addListing(hostId, {
    title: "Family Apartment in George Town",
    city: "George Town",
    country: "Malaysia",
    price: 320,
    beds: 3,
    baths: 2,
    instant: false,
    desc: "Spacious unit near heritage sites and street food heaven.",
    photoSeeds: ["gtown1", "gtown2", "gtown3"],
  });

  await addListing(hostId, {
    title: "Seaview Condo Tanjung Tokong",
    city: "Tanjung Tokong",
    country: "Malaysia",
    price: 450,
    beds: 2,
    baths: 2,
    instant: false,
    desc: "Balcony with sea breeze. Pool & gym access.",
    photoSeeds: ["ttokong1", "ttokong2", "ttokong3"],
  });
  // ---- End curated ----

  // Fill the rest with randoms so grid looks alive
  for (let i = 0; i < 8; i++) {
    const city = faker.location.city();
    const country = faker.location.country();
    await addListing(hostId, {
      title: `${faker.word.adjective()} ${faker.word.noun()} in ${city}`,
      city,
      country,
      price: faker.number.int({ min: 80, max: 480 }),
      beds: faker.number.int({ min: 1, max: 5 }),
      baths: faker.number.int({ min: 1, max: 3 }),
      instant: faker.datatype.boolean(),
    });
  }

  // Tiny stats log so you can verify quickly
  const stats = await db.execute(
    sql`SELECT city, COUNT(*) AS n FROM listings GROUP BY city ORDER BY n DESC, city ASC;`
  );
  console.log("✅ Seed complete. City counts:", stats.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {}
  });
