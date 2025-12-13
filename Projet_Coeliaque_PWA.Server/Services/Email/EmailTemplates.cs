namespace Projet_Coeliaque_PWA.Server.Services.Email
{
    public static class EmailTemplates
    {
        public const string ConfirmEmailFr = """
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Confirmation de courriel</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f9fafb; padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" style="background:#ffffff; padding:24px; border-radius:8px;">
          <tr><td>
            <h2 style="margin:0 0 12px;">Confirmez votre adresse courriel</h2>
            <p>Bonjour,</p>
            <p>
              Merci de vous être inscrit sur <strong>Services Coeliaque</strong>.
              Veuillez confirmer votre adresse courriel en cliquant sur le bouton ci-dessous :
            </p>

            <p style="text-align:center; margin:24px 0;">
              <a href="{{CONFIRM_URL}}"
                 style="background:#2563eb; color:#ffffff; padding:12px 18px;
                        text-decoration:none; border-radius:6px; display:inline-block;">
                Confirmer mon courriel
              </a>
            </p>

            <p style="margin-top:0;">
              Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer ce message.
            </p>

            <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

            <p style="font-size:12px; color:#6b7280; margin:0;">
              Ce courriel vous a été envoyé parce qu’un compte a été créé sur <strong>servicescoeliaque.ca</strong>.
            </p>
            <p style="font-size:12px; color:#6b7280; margin:8px 0 0;">
              — Services Coeliaque
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

        public const string ConfirmEmailEn = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Email confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f9fafb; padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" style="background:#ffffff; padding:24px; border-radius:8px;">
          <tr><td>
            <h2 style="margin:0 0 12px;">Confirm your email address</h2>
            <p>Hello,</p>
            <p>
              Thank you for signing up for <strong>Services Coeliaque</strong>.
              Please confirm your email address by clicking the button below:
            </p>

            <p style="text-align:center; margin:24px 0;">
              <a href="{{CONFIRM_URL}}"
                 style="background:#2563eb; color:#ffffff; padding:12px 18px;
                        text-decoration:none; border-radius:6px; display:inline-block;">
                Confirm my email
              </a>
            </p>

            <p style="margin-top:0;">
              If you did not request this, you can safely ignore this email.
            </p>

            <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

            <p style="font-size:12px; color:#6b7280; margin:0;">
              This email was sent because an account was created on <strong>servicescoeliaque.ca</strong>.
            </p>
            <p style="font-size:12px; color:#6b7280; margin:8px 0 0;">
              — Services Coeliaque
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";
        public const string ResetPasswordFr = """
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Réinitialisation du mot de passe</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f9fafb; padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" style="background:#ffffff; padding:24px; border-radius:8px;">
          <tr><td>
            <h2 style="margin:0 0 12px;">Réinitialisez votre mot de passe</h2>

            <p>Bonjour,</p>

            <p>
              Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte
              <strong>Services Coeliaque</strong>.
            </p>

            <p style="text-align:center; margin:24px 0;">
              <a href="{{RESET_URL}}"
                 style="background:#2563eb; color:#ffffff; padding:12px 18px;
                        text-decoration:none; border-radius:6px; display:inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </p>

            <p style="margin-top:0;">
              Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer ce courriel.
            </p>

            <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

            <p style="font-size:12px; color:#6b7280; margin:0;">
              Ce courriel a été envoyé suite à une demande sur <strong>servicescoeliaque.ca</strong>.
            </p>
            <p style="font-size:12px; color:#6b7280; margin:8px 0 0;">
              — Services Coeliaque
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

        public const string ResetPasswordEn = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Password reset</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f9fafb; padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" style="background:#ffffff; padding:24px; border-radius:8px;">
          <tr><td>
            <h2 style="margin:0 0 12px;">Reset your password</h2>

            <p>Hello,</p>

            <p>
              We received a password reset request for your <strong>Services Coeliaque</strong> account.
            </p>

            <p style="text-align:center; margin:24px 0;">
              <a href="{{RESET_URL}}"
                 style="background:#2563eb; color:#ffffff; padding:12px 18px;
                        text-decoration:none; border-radius:6px; display:inline-block;">
                Reset my password
              </a>
            </p>

            <p style="margin-top:0;">
              If you did not request this, you can safely ignore this email.
            </p>

            <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

            <p style="font-size:12px; color:#6b7280; margin:0;">
              This email was sent due to a request on <strong>servicescoeliaque.ca</strong>.
            </p>
            <p style="font-size:12px; color:#6b7280; margin:8px 0 0;">
              — Services Coeliaque
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";
    }
}
