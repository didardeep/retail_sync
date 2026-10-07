import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditsLink, entityLink, issuesLink, questionsLink, schedulingLink,
  sopAuditReviewLink, sopAuditRunLink, sopAuditsLink, sopDashboardLink,
  sopToolEditorLink, storeScorecardLink, storesLink,
} from '../src/lib/links.js';

test('empty params give a bare path', () => {
  assert.equal(auditsLink(), '/audits');
  assert.equal(auditsLink({ stage: '', store: null, region: undefined }), '/audits');
});

test('values are encoded and empty ones skipped', () => {
  assert.equal(auditsLink({ stage: 'in_progress', region: 'North & East', store: '' }),
    '/audits?stage=in_progress&region=North%20%26%20East');
});

test('named builders', () => {
  assert.equal(auditsLink({ stage: 'scheduled', kind: 'sop', store: 's1', region: 'N', id: 'a1' }),
    '/audits?stage=scheduled&kind=sop&store=s1&region=N&id=a1');
  assert.equal(schedulingLink({ stage: 'scheduled', auditor: 'u1', id: 'a1', newKind: 'sop' }),
    '/scheduling?stage=scheduled&auditor=u1&id=a1&new=sop');
  assert.equal(issuesLink({ status: 'Open', priority: 'High', store: 's1', audit: 'a', sop_audit: 'b', id: 'i' }),
    '/issues?status=Open&priority=High&store=s1&audit=a&sop_audit=b&id=i');
  assert.equal(storesLink({ region: 'N', format: 'Mall', id: 's1' }), '/stores?region=N&format=Mall&id=s1');
  assert.equal(sopAuditsLink({ store: 's1', tool: 'T', status: 'Draft', view: 'assigned' }),
    '/sop-audits?store=s1&tool=T&status=Draft&view=assigned');
  assert.equal(sopDashboardLink({ store: 's1', tool: 'T', section: 'A', criterion: 'c' }),
    '/dashboard?tab=sop&store=s1&tool=T&section=A&criterion=c');
  assert.equal(sopDashboardLink(), '/dashboard?tab=sop');
  assert.equal(sopAuditReviewLink('x1'), '/sop-audits/x1/review');
  assert.equal(sopAuditRunLink('x1'), '/sop-audits/x1');
  assert.equal(questionsLink({ tab: 'sop-tools' }), '/questions?tab=sop-tools');
  assert.equal(questionsLink(), '/questions');
  assert.equal(sopToolEditorLink('FOOD'), '/questions/sop-tools/FOOD');
});

test('storeScorecardLink depends on role', () => {
  assert.equal(storeScorecardLink('s1', 'AUDIT_MANAGER'), '/dashboard?store=s1');
  assert.equal(storeScorecardLink('s1', 'ADMIN'), '/dashboard?store=s1');
  assert.equal(storeScorecardLink('s1', 'AUDITOR'), '/sop-audits?store=s1');
  assert.equal(storeScorecardLink('s1', 'STORE_MANAGER'), '/sop-audits?store=s1');
});

test('entityLink known and unknown types', () => {
  assert.equal(entityLink('store', 's1'), '/stores?id=s1');
  assert.equal(entityLink('audit', 'a1'), '/audits?id=a1');
  assert.equal(entityLink('issue', 'i1'), '/issues?id=i1');
  assert.equal(entityLink('sop_audit', 'x1'), '/sop-audits/x1/review');
  assert.equal(entityLink('question', 'q1'), '/questions');
  assert.equal(entityLink('data_import', 'd1'), null);
  assert.equal(entityLink('sop_criterion', 'c1'), null);
  assert.equal(entityLink('mystery', 'z'), null);
  assert.equal(entityLink('store', null), null);
});
