namespace Projet_Coeliaque_PWA.Server.Services
{
    public interface IEmailSender
    {
        Task SendEmailAsync(string toEmail, string subject, string htmlMessage);
    }
    public class DevEmailSender : IEmailSender
    {
        public Task SendEmailAsync(string toEmail, string subject, string htmlMessage)
        {
            System.Diagnostics.Debug.WriteLine($"To: {toEmail}\nSubject: {subject}\nHTML: {htmlMessage}\n");
            return Task.CompletedTask;
        }
    }
}
