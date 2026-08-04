const assert = require('node:assert/strict');
const test = require('node:test');

test('recovery email explicitly returns account identity to the registered inbox', async t => {
    const nodemailerModulePath = require.resolve('nodemailer');
    const emailServiceModulePath = require.resolve('../services/emailService');
    const originalNodemailerModule = require.cache[nodemailerModulePath];
    const originalSmtpPort = process.env.SMTP_PORT;
    let sentMail;
    let transportOptions;

    require.cache[nodemailerModulePath] = {
        id: nodemailerModulePath,
        filename: nodemailerModulePath,
        loaded: true,
        exports: {
            createTransport(options) {
                transportOptions = options;
                return {
                    verify(callback) {
                        callback(null, true);
                    },
                    async sendMail(mailOptions) {
                        sentMail = mailOptions;
                        return { messageId: 'test-message' };
                    }
                };
            }
        }
    };
    delete require.cache[emailServiceModulePath];
    process.env.SMTP_PORT = '587';

    t.after(() => {
        delete require.cache[emailServiceModulePath];

        if (originalNodemailerModule) {
            require.cache[nodemailerModulePath] = originalNodemailerModule;
        } else {
            delete require.cache[nodemailerModulePath];
        }

        if (originalSmtpPort === undefined) {
            delete process.env.SMTP_PORT;
        } else {
            process.env.SMTP_PORT = originalSmtpPort;
        }
    });

    const { sendPasswordResetEmail } = require('../services/emailService');
    const result = await sendPasswordResetEmail(
        'registered@example.test',
        'https://public.example.test/reset-password?token=abc',
        {
            username: '<AccountOwner>',
            email: 'registered@example.test',
            first_name: 'Alex',
            last_name: 'Researcher'
        },
        { messageId: '<stable-recovery-id@example.test>' }
    );

    assert.equal(result.success, true);
    assert.equal(transportOptions.port, 587);
    assert.equal(transportOptions.secure, false);
    assert.equal(transportOptions.requireTLS, true);
    assert.equal(transportOptions.tls, undefined);
    assert.equal(transportOptions.connectionTimeout, 10000);
    assert.equal(transportOptions.socketTimeout, 30000);
    assert.equal(sentMail.to, 'registered@example.test');
    assert.equal(sentMail.messageId, '<stable-recovery-id@example.test>');
    assert.match(sentMail.html, /Account username:/);
    assert.match(sentMail.html, /&lt;AccountOwner&gt;/);
    assert.match(sentMail.html, /Registered email:/);
    assert.match(sentMail.html, /registered@example\.test/);
    assert.match(sentMail.html, /Account name:/);
    assert.match(sentMail.html, /Alex Researcher/);
    assert.doesNotMatch(sentMail.html, /<AccountOwner>/);
    assert.match(sentMail.text, /Account username: <AccountOwner>/);
    assert.match(sentMail.text, /Registered email: registered@example\.test/);
    assert.match(sentMail.text, /Account name: Alex Researcher/);
});
