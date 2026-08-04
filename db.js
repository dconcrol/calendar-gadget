const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createDatabase(dbPath) {
  const ensure = () => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify({ schedules: [] }, null, 2));
    }
  };

  const read = () => {
    ensure();
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      if (!Array.isArray(data.schedules)) data.schedules = [];
      return data;
    } catch (_) {
      return { schedules: [] };
    }
  };

  const write = (data) => {
    ensure();
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  };

  return {
    path: dbPath,

    listByDate(date) {
      return read()
        .schedules.filter((s) => s.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    listDatesInMonth(year, month) {
      // month: 1-12
      const prefix = `${year}-${String(month).padStart(2, '0')}-`;
      const dates = new Set();
      for (const s of read().schedules) {
        if (s.date && s.date.startsWith(prefix)) dates.add(s.date);
      }
      return [...dates];
    },

    create({ date, title, notes = '' }) {
      const data = read();
      const item = {
        id: crypto.randomUUID(),
        date,
        title: String(title || '').trim(),
        notes: String(notes || '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!item.title) throw new Error('Title is required');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error('Invalid date');
      data.schedules.push(item);
      write(data);
      return item;
    },

    update(id, patch) {
      const data = read();
      const idx = data.schedules.findIndex((s) => s.id === id);
      if (idx < 0) throw new Error('Schedule not found');
      const current = data.schedules[idx];
      const next = {
        ...current,
        title: patch.title != null ? String(patch.title).trim() : current.title,
        notes: patch.notes != null ? String(patch.notes).trim() : current.notes,
        updatedAt: new Date().toISOString(),
      };
      if (!next.title) throw new Error('Title is required');
      data.schedules[idx] = next;
      write(data);
      return next;
    },

    remove(id) {
      const data = read();
      const before = data.schedules.length;
      data.schedules = data.schedules.filter((s) => s.id !== id);
      if (data.schedules.length === before) throw new Error('Schedule not found');
      write(data);
      return true;
    },
  };
}

module.exports = { createDatabase };
