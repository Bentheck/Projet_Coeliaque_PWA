using System.Linq;
using Projet_Coeliaque_PWA.Server.Services.Receipts;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class ReceiptImportMapperTests
    {
        [Fact]
        public void MapParsedToImportItems_GenericFallback_KeepsLinesAfterSubtotal()
        {
            var parsed = new ReceiptParsed(
                StoreName: "Corner Shop",
                ReceiptDateIso: null,
                Total: null,
                Lines: new[]
                {
                    new ReceiptParsedLine("APPLES 1.99", "APPLES", 1.99m, 1m),
                    new ReceiptParsedLine("SOUS-TOTAL 1.99", "SOUS-TOTAL", 1.99m, null),
                    new ReceiptParsedLine("LATE ITEM 2.49", "LATE ITEM", 2.49m, 1m),
                });

            var items = ReceiptImportMapper.MapParsedToImportItems(parsed).ToList();

            Assert.Collection(
                items,
                first =>
                {
                    Assert.Equal("APPLES", first.Item);
                    Assert.Equal(1.99m, first.Prix);
                    Assert.Equal(1m, first.Quantite);
                },
                second =>
                {
                    Assert.Equal("LATE ITEM", second.Item);
                    Assert.Equal(2.49m, second.Prix);
                    Assert.Equal(1m, second.Quantite);
                });
        }

        [Fact]
        public void MapParsedToImportItems_StoreSpecificProfile_StillStopsAtSubtotal()
        {
            var parsed = new ReceiptParsed(
                StoreName: "Walmart",
                ReceiptDateIso: null,
                Total: null,
                Lines: new[]
                {
                    new ReceiptParsedLine("MILK 1.99", "MILK", 1.99m, 1m),
                    new ReceiptParsedLine("SOUS-TOTAL 1.99", "SOUS-TOTAL", 1.99m, null),
                    new ReceiptParsedLine("BREAD 2.49", "BREAD", 2.49m, 1m),
                });

            var items = ReceiptImportMapper.MapParsedToImportItems(parsed).ToList();

            var item = Assert.Single(items);
            Assert.Equal("MILK", item.Item);
            Assert.Equal(1.99m, item.Prix);
            Assert.Equal(1m, item.Quantite);
        }
    }
}
