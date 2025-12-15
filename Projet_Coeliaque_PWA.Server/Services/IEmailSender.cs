using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Services
{
    /// <summary>
    /// Attachment contract (keeps IEmailSender free of MimeKit types).
    /// </summary>
    public sealed record EmailAttachment(string FileName, byte[] Content, string ContentType);

    public interface IEmailSender
    {
        Task SendEmailAsync(string toEmail, string subject, string htmlMessage);

        // Reply-To support (used by contact form)
        Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName
        );

        // Reply-To + attachments support (used by contact form)
        Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName,
            IReadOnlyList<EmailAttachment>? attachments
        );
    }

    public class DevEmailSender : IEmailSender
    {
        public Task SendEmailAsync(string toEmail, string subject, string htmlMessage)
            => SendEmailAsync(toEmail, subject, htmlMessage, null, null, null);

        public Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName
        )
            => SendEmailAsync(toEmail, subject, htmlMessage, replyToEmail, replyToName, null);

        public Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName,
            IReadOnlyList<EmailAttachment>? attachments
        )
        {
            var attCount = attachments?.Count ?? 0;
            var attList = attachments == null || attachments.Count == 0
                ? "(none)"
                : string.Join(", ", attachments.Select(a =>
                    $"{a.FileName} ({a.ContentType}, {a.Content?.Length ?? 0} bytes)"));

            System.Diagnostics.Debug.WriteLine(
                $"To: {toEmail}\n" +
                $"Subject: {subject}\n" +
                $"Reply-To: {replyToName}<{replyToEmail}>\n" +
                $"Attachments: {attCount} => {attList}\n" +
                $"HTML: {htmlMessage}\n"
            );

            return Task.CompletedTask;
        }
    }
}
