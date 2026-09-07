import { expect, test } from 'bun:test';
import { parseEventId, parseEventInput } from '../src/api/event/event-input.js';

const valid = { title: 'test', begin: '2026-09-01 00:00:00', end: '2026-09-30 00:00:00', problems: [1000] };
test('create parses numeric problem arrays into event input', () => {
  expect(parseEventInput(valid, 'create')).toEqual({ ...valid, desc: null });
});
test('update parses the comma-separated contract', () => {
  expect(parseEventInput({ ...valid, problems: '1000, 2000' }, 'update')?.problems).toEqual([1000, 2000]);
});
test('update permits removing all problems', () => {
  expect(parseEventInput({ ...valid, problems: '' }, 'update')?.problems).toEqual([]);
});
test.each([null, [], 'wrong', {}, { ...valid, title: '' }, { ...valid, begin: 'wrong' }, { ...valid, end: '2020-01-01' }, { ...valid, problems: [] }, { ...valid, problems: ['1000'] }, { ...valid, problems: [1.5] }].map(input => ({ input })))('malformed create input is rejected: %j', ({ input }) => {
  expect(parseEventInput(input, 'create')).toBeNull();
});
test.each(['1000,invalid', '1000,', '1.5', '-1', '0', 'Infinity'])('malformed update problems are rejected: %s', problems => {
  expect(parseEventInput({ ...valid, problems }, 'update')).toBeNull();
});
test.each(['0', '-1', '1junk', '1.5', '', '9007199254740992'])('malformed event IDs are rejected: %s', id => {
  expect(parseEventId(id)).toBeNull();
});
