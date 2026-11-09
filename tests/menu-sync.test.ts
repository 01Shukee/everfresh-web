
import assert from "node:assert/strict";
import { test } from "node:test";
import { seedAll } from "../prisma/seed-data";
import { MENU } from "../prisma/menu-data";
import { syncMenu } from "../prisma/menu-sync";
import { MemoryRepo } from "../src/server/repo";

const quiet = () => {};
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sampleRepo = async () => {
  const repo = new MemoryRepo();
  await seedAll(repo, quiet);
  return repo;
};

const publicDir = "public";

test("all 21 official dishes exist once with the correct prices", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const items = (await repo.listItems()).filter((item) => item.active);

  for (const dish of MENU) {
    const matches = items.filter(
      (item) => norm(item.name) === norm(dish.name),
    );

    assert.equal(matches.length, 1, `${dish.name} should appear once`);
    assert.equal(
      matches[0].basePriceKobo,
      dish.priceNaira * 100,
      `${dish.name} should have the correct price`,
    );
    assert.equal(matches[0].variants.length, 0, `${dish.name} should have no sizes`);
    assert.equal(
      matches[0].addOnGroups.length,
      0,
      `${dish.name} should have no old protein add-ons`,
    );
  }

  assert.equal(MENU.length, 21);
});

test("the 17 starter dishes are reused and four standalone proteins are added", async () => {
  const repo = await sampleRepo();
  const before = await repo.listItems();

  const report = await syncMenu(repo, { log: quiet, publicDir });
  const after = await repo.listItems();

  assert.equal(report.replaced.length, 17);
  assert.equal(report.created.length, 4);
  assert.equal(after.length, before.length + 4);

  for (const name of ["Chicken", "Ice Fish", "Beef", "Turkey"]) {
    assert.equal(
      after.filter((item) => norm(item.name) === norm(name)).length,
      1,
      `${name} should exist once`,
    );
  }
});

test("the four soup dishes receive their official names", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const items = await repo.listItems();

  const expected = [
    "Bitter Leaf Soup with Semo and 1 Beef",
    "Egusi Soup with Garri and 1 Beef",
    "Oha Soup with Fufu and 1 Beef",
    "Nsala Soup with Fufu and 1 Beef",
  ];

  for (const name of expected) {
    assert.equal(
      items.filter((item) => norm(item.name) === norm(name)).length,
      1,
      `${name} should exist once`,
    );
  }

  for (const oldName of [
    "Bitter Leaf Soup with Semo",
    "Egusi Soup with Garri",
    "Oha Soup with Fufu",
    "Nsala Soup with Fufu",
  ]) {
    assert.equal(
      items.some(
        (item) => item.active && norm(item.name) === norm(oldName),
      ),
      false,
      `${oldName} should no longer be active`,
    );
  }
});

test("official categories and dishes appear before the other menu records", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const categories = await repo.listCategories();
  const items = (await repo.listItems()).filter((item) => item.active);

  assert.deepEqual(
    categories.slice(0, 3).map((category) => category.name),
    ["Main Meals", "Soups and Special Dishes", "Protein and Extras"],
  );

  assert.deepEqual(
    items.slice(0, MENU.length).map((item) => item.name),
    MENU.map((dish) => dish.name),
  );
});

test("cakes remain active and old empty food categories are switched off", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const items = await repo.listItems();
  const categories = await repo.listCategories();

  const weddingCake = items.find(
    (item) => item.name === "Classic White Wedding Cake",
  );

  assert.ok(weddingCake, "wedding cake should still exist");
  assert.equal(weddingCake.active, true);

  for (const name of [
    "Rice and Pasta",
    "Local Dishes",
    "Soups and Swallows",
    "Fish",
  ]) {
    const category = categories.find(
      (item) => norm(item.name) === norm(name),
    );

    if (category) {
      assert.equal(category.active, false, `${name} should be inactive`);
    }
  }

  for (const name of [
    "Main Meals",
    "Soups and Special Dishes",
    "Protein and Extras",
  ]) {
    const category = categories.find(
      (item) => norm(item.name) === norm(name),
    );

    assert.ok(category?.active, `${name} should remain active`);
  }
});

test("an admin-edited dish is preserved", async () => {
  const repo = await sampleRepo();

  const moiMoi = (await repo.listItems()).find(
    (item) => item.name === "Moi Moi",
  );

  assert.ok(moiMoi);

  await repo.saveItem({
    ...moiMoi,
    imageUrl: `/uploads/${"a".repeat(32)}.jpg`,
    imageAlt: "Our own photo",
    basePriceKobo: 150000,
  });

  const report = await syncMenu(repo, { log: quiet, publicDir });

  const after = (await repo.listItems()).filter(
    (item) => norm(item.name) === norm("Moi Moi"),
  );

  assert.equal(after.length, 1);
  assert.equal(after[0].basePriceKobo, 150000);
  assert.equal(after[0].imageAlt, "Our own photo");
  assert.ok(report.keptAsIs.includes("Moi Moi"));
});

test("running the sync again does not create duplicates", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const count = (await repo.listItems()).length;

  const second = await syncMenu(repo, { log: quiet, publicDir });

  assert.ok(second.skipped);
  assert.equal((await repo.listItems()).length, count);

  await syncMenu(repo, {
    log: quiet,
    publicDir,
    force: true,
  });

  assert.equal((await repo.listItems()).length, count);

  const active = (await repo.listItems())
    .filter((item) => item.active)
    .map((item) => norm(item.name));

  assert.equal(new Set(active).size, active.length);
});

test("an empty database receives all 21 dishes and three categories", async () => {
  const repo = new MemoryRepo();

  const report = await syncMenu(repo, { log: quiet, publicDir });

  assert.equal(report.created.length, MENU.length);

  assert.deepEqual(
    (await repo.listCategories()).map((category) => category.name),
    ["Main Meals", "Soups and Special Dishes", "Protein and Extras"],
  );

  const items = (await repo.listItems()).filter((item) => item.active);

  assert.equal(items.length, MENU.length);
});

test("dry run does not change items, categories or the import marker", async () => {
  const repo = await sampleRepo();

  const beforeItems = JSON.stringify(await repo.listItems());
  const beforeCategories = JSON.stringify(await repo.listCategories());

  await syncMenu(repo, {
    log: quiet,
    publicDir,
    dryRun: true,
  });

  assert.equal(JSON.stringify(await repo.listItems()), beforeItems);
  assert.equal(
    JSON.stringify(await repo.listCategories()),
    beforeCategories,
  );

  assert.equal(await repo.docGet("meta", "everfresh-menu-v1"), null);
});

test("keepSamples does not switch off unrelated old sample dishes", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, {
    log: quiet,
    publicDir,
    keepSamples: true,
  });

  const items = await repo.listItems();

  assert.equal(
    items.find((item) => item.name === "Classic White Wedding Cake")?.active,
    true,
  );
});

test("reorderOnly changes order without creating dishes", async () => {
  const repo = await sampleRepo();

  await syncMenu(repo, { log: quiet, publicDir });

  const before = (await repo.listItems()).length;

  const report = await syncMenu(repo, {
    log: quiet,
    publicDir,
    reorderOnly: true,
  });

  assert.equal((await repo.listItems()).length, before);
  assert.equal(report.created.length, 0);
  assert.equal(report.replaced.length, 0);
});
