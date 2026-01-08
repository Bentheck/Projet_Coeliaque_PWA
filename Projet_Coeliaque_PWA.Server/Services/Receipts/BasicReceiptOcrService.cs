using System.Threading;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Services.Receipts
{
    /// <summary>
    /// Stub pour tests. À remplacer plus tard par Google Vision / Azure.
    /// </summary>
    public class BasicReceiptOcrService : IReceiptOcrService
    {
        public Task<ReceiptParsed> ParseAsync(string absoluteImagePath, CancellationToken ct)
        {
            // Pour le moment on retourne un résultat vide.
            var parsed = new ReceiptParsed(
                StoreName: null,
                ReceiptDateIso: null,
                Total: null,
                Lines: new ReceiptParsedLine[]
                {
                    // Exemple (tu peux en laisser 0 également)
                    //new("EXEMPLE LIGNE 1", "Produit exemple", 3.99m, 1)
                }
            );

            return Task.FromResult(parsed);
        }
    }
}
