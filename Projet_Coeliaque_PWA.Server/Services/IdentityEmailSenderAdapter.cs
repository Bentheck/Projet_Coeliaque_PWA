using Microsoft.AspNetCore.Identity.UI.Services;

namespace Projet_Coeliaque_PWA.Server.Services
{
    /// <summary>
    /// Adapter so ASP.NET Core Identity can send emails (confirm/reset) using our app email sender.
    /// </summary>
    public sealed class IdentityEmailSenderAdapter : Microsoft.AspNetCore.Identity.UI.Services.IEmailSender
    {
        private readonly Projet_Coeliaque_PWA.Server.Services.IEmailSender _inner;

        public IdentityEmailSenderAdapter(Projet_Coeliaque_PWA.Server.Services.IEmailSender inner)
        {
            _inner = inner;
        }

        public Task SendEmailAsync(string email, string subject, string htmlMessage)
            => _inner.SendEmailAsync(email, subject, htmlMessage);
    }
}
