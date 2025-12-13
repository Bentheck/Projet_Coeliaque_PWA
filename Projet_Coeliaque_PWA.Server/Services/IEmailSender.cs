namespace Projet_Coeliaque_PWA.Server.Services
{
    public interface IEmailSender
    {
        Task SendEmailAsync(string toEmail, string subject, string htmlMessage);

        // NEW: reply-to support (used by contact form)
        Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName
        );
    }

    public class DevEmailSender : IEmailSender
    {
        public Task SendEmailAsync(string toEmail, string subject, string htmlMessage)
            => SendEmailAsync(toEmail, subject, htmlMessage, null, null);

        public Task SendEmailAsync(
            string toEmail,
            string subject,
            string htmlMessage,
            string? replyToEmail,
            string? replyToName
        )
        {
            System.Diagnostics.Debug.WriteLine(
                $"To: {toEmail}\nSubject: {subject}\nReply-To: {replyToName}<{replyToEmail}>\nHTML: {htmlMessage}\n"
            );
            return Task.CompletedTask;
        }
    }
}
