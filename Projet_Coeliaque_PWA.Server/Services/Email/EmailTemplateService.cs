namespace Projet_Coeliaque_PWA.Server.Services.Email
{
    public sealed class EmailTemplateService
    {
        public string BuildConfirmEmail(string lang, string confirmUrl)
        {
            var tpl = lang == "en" ? EmailTemplates.ConfirmEmailEn : EmailTemplates.ConfirmEmailFr;
            return tpl.Replace("{{CONFIRM_URL}}", confirmUrl);
        }

        public string BuildResetPassword(string lang, string resetUrl)
        {
            var tpl = lang == "en" ? EmailTemplates.ResetPasswordEn : EmailTemplates.ResetPasswordFr;
            return tpl.Replace("{{RESET_URL}}", resetUrl);
        }

        public static string NormalizeLang(string? lang)
        {
            // Accept: "en", "en-US", "fr-CA", etc.
            if (string.IsNullOrWhiteSpace(lang)) return "fr";
            lang = lang.Trim().ToLowerInvariant();
            return lang.StartsWith("en") ? "en" : "fr";
        }
    }
}
