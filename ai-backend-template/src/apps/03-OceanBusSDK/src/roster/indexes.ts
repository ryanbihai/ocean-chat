import type { Contact, RosterIndexes } from '../types/roster';

export function addToIndexes(indexes: RosterIndexes, contact: Contact): void {
  for (const tag of contact.tags) {
    if (!indexes.byTag[tag]) indexes.byTag[tag] = [];
    if (!indexes.byTag[tag].includes(contact.id)) indexes.byTag[tag].push(contact.id);
  }
  for (const oid of contact.openIds) {
    if (!indexes.byOpenId[oid]) indexes.byOpenId[oid] = contact.id;
  }
}

export function removeFromIndexes(indexes: RosterIndexes, contact: Contact): void {
  for (const tag of contact.tags) {
    const list = indexes.byTag[tag];
    if (list) {
      indexes.byTag[tag] = list.filter(id => id !== contact.id);
      if (indexes.byTag[tag].length === 0) delete indexes.byTag[tag];
    }
  }
  for (const oid of contact.openIds) {
    if (indexes.byOpenId[oid] === contact.id) delete indexes.byOpenId[oid];
  }
}

export function updateTagsInIndexes(indexes: RosterIndexes, contact: Contact, oldTags: string[], newTags: string[]): void {
  const added = newTags.filter(t => !oldTags.includes(t));
  const removed = oldTags.filter(t => !newTags.includes(t));

  for (const tag of added) {
    if (!indexes.byTag[tag]) indexes.byTag[tag] = [];
    if (!indexes.byTag[tag].includes(contact.id)) indexes.byTag[tag].push(contact.id);
  }
  for (const tag of removed) {
    const list = indexes.byTag[tag];
    if (list) {
      indexes.byTag[tag] = list.filter(id => id !== contact.id);
      if (indexes.byTag[tag].length === 0) delete indexes.byTag[tag];
    }
  }
}
