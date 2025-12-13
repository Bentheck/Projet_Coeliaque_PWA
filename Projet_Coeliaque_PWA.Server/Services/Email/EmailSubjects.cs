namespace Projet_Coeliaque_PWA.Server.Services.Email
{
    public static class EmailSubjects
    {
        public static string ConfirmEmail(string lang)
            => lang == "en" ? "Confirm your email address" : "Confirmez votre adresse courriel";

        public static string ResetPassword(string lang)
            => lang == "en" ? "Reset your password" : "Réinitialisation de votre mot de passe";

    }
}
