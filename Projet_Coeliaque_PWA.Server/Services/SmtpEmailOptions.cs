namespace Projet_Coeliaque_PWA.Server.Services
{
    public sealed class SmtpEmailOptions
    {
        public string Host { get; set; } = "smtp.gmail.com";
        public int Port { get; set; } = 587;

        // Google Workspace typically uses STARTTLS on 587
        public bool UseStartTls { get; set; } = true;

        // Auth user (real mailbox), e.g. benoit@solutionsbensoft.ca
        public string Username { get; set; } = "";

        // Google App Password (NOT your normal password)
        public string Password { get; set; } = "";

        // From can be an alias, e.g. noreply@solutionsbensoft.ca
        public string FromEmail { get; set; } = "";
        public string FromName { get; set; } = "Solutions BenSoft";

        public bool UseSmtpInDev { get; set; } = false;
    }
}
