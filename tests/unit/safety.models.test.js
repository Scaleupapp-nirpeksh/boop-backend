const mongoose = require('mongoose');
const Block = require('../../src/models/Block');
const Report = require('../../src/models/Report');
const ModerationFlag = require('../../src/models/ModerationFlag');
const { REPORT_REASONS } = require('../../src/utils/constants');

const oid = () => new mongoose.Types.ObjectId();

describe('safety models', () => {
  it('Block requires blocker and blocked', () => {
    const err = new Block({}).validateSync();
    expect(err.errors.blocker).toBeDefined();
    expect(err.errors.blocked).toBeDefined();
  });

  it('REPORT_REASONS includes the core reasons', () => {
    expect(REPORT_REASONS).toEqual(
      expect.arrayContaining(['harassment', 'fake_profile', 'underage', 'spam', 'other'])
    );
  });

  it('Report rejects unknown reasons', () => {
    const err = new Report({ reporter: oid(), reported: oid(), reason: 'not_a_reason' }).validateSync();
    expect(err.errors.reason).toBeDefined();
  });

  it('Report defaults to pending', () => {
    const report = new Report({ reporter: oid(), reported: oid(), reason: 'spam' });
    expect(report.validateSync()).toBeUndefined();
    expect(report.status).toBe('pending');
  });

  it('ModerationFlag requires contentType and userId', () => {
    const err = new ModerationFlag({}).validateSync();
    expect(err.errors.contentType).toBeDefined();
    expect(err.errors.userId).toBeDefined();
  });

  it('ModerationFlag defaults to pending', () => {
    const flag = new ModerationFlag({ contentType: 'message', userId: oid() });
    expect(flag.validateSync()).toBeUndefined();
    expect(flag.status).toBe('pending');
  });
});
