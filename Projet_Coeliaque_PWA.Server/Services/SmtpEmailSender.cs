using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Projet_Coeliaque_PWA.Server.Services
{
    public sealed class SmtpEmailSender : IEmailSender
    {
        private readonly SmtpEmailOptions _opt;
        private readonly ILogger<SmtpEmailSender> _logger;

        public SmtpEmailSender(IOptions<SmtpEmailOptions> opt, ILogger<SmtpEmailSender> logger)
        {
            _opt = opt.Value;
            _logger = logger;
        }

        public async Task SendEmailAsync(string toEmail, string subject, string htmlMessage)
    => await SendEmailAsync(toEmail, subject, htmlMessage, null, null);

        public async Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName
        )
        {
            if (string.IsNullOrWhiteSpace(toEmail))
                throw new ArgumentException("toEmail is required.", nameof(toEmail));

            if (string.IsNullOrWhiteSpace(_opt.FromEmail))
                throw new InvalidOperationException("SMTP FromEmail is not configured.");

            var message = new MimeMessage();

            // From: can be an alias (must exist in Workspace Gmail "Send mail as")
            var from = new MailboxAddress(_opt.FromName ?? "", _opt.FromEmail);

            // Sender: authenticated mailbox (often must match Username)
            var sender = new MailboxAddress(_opt.FromName ?? "", _opt.Username);

            message.From.Clear();
            message.From.Add(from);
            message.Sender = sender;

            // Reply-To:
            // - Contact form: reply to user
            // - Default: reply to From alias
            message.ReplyTo.Clear();
            if (!string.IsNullOrWhiteSpace(replyToEmail))
            {
                message.ReplyTo.Add(new MailboxAddress(replyToName ?? replyToEmail, replyToEmail));
            }
            else
            {
                message.ReplyTo.Add(from);
            }

            message.To.Clear();
            message.To.Add(MailboxAddress.Parse(toEmail));
            message.Subject = subject ?? "";

            message.Body = new BodyBuilder
            {
                HtmlBody = htmlMessage ?? ""
            }.ToMessageBody();

            using var client = new SmtpClient();

            try
            {
                client.CheckCertificateRevocation = true;

                var secure = _opt.UseStartTls
                    ? SecureSocketOptions.StartTls
                    : SecureSocketOptions.Auto;

                await client.ConnectAsync(_opt.Host, _opt.Port, secure);
                await client.AuthenticateAsync(_opt.Username, _opt.Password);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SMTP email send failed (To={ToEmail}, Subject={Subject})", toEmail, subject);
                throw;
            }
        }
    }
}
