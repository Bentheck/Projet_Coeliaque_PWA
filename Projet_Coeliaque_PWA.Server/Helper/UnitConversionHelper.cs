using System;

/// <summary>
/// Provides helper methods for unit conversions related to pricing per 100g or 100ml.
/// </summary>
public static class UnitConversionHelper
{
    /// <summary>
    /// Calculates the price per standardized 100g (for weight-based units) or 100ml (for volume-based units),
    /// falling back to a unit price when the unit is not recognized.
    /// </summary>
    /// <param name="price">The total price of the product.</param>
    /// <param name="format">The product's quantity (numeric part, e.g. 250 for 250g).</param>
    /// <param name="unit">The unit of measurement (e.g. "g", "kg", "ml", "l", "oz").</param>
    /// <returns>
    /// A tuple where:
    /// <list type="bullet">
    /// <item><description><c>pricePer100</c> is the calculated price per standardized quantity (100g or 100ml).</description></item>
    /// <item><description><c>label</c> is a string label representing the unit basis (e.g., "$/100g", "$/100ml", or "$/Unité").</description></item>
    /// </list>
    /// </returns>
    /// <remarks>
    /// <para>
    /// Recognized weight units: <c>mg</c>, <c>g</c>, <c>kg</c>, <c>lb</c>, <c>oz</c>.
    /// Recognized volume units: <c>ml</c>, <c>l</c>, <c>fl oz</c>.
    /// </para>
    /// <para>
    /// For unrecognized units, the calculation falls back to <c>price ÷ quantity</c> and uses the label <c>$/Unité</c>.
    /// </para>
    /// </remarks>
    public static (decimal pricePer100, string label) GetPricePer100(decimal price, double format, string unit)
    {
        if (format == 0 || string.IsNullOrWhiteSpace(unit))
            return (0m, "$/Unité");

        string[] massUnits = { "mg", "g", "kg", "lb", "oz" };
        string[] volUnits = { "ml", "l", "fl oz" };
        string label = "$/Unité";
        decimal baseQty = 1;

        string u = unit.ToLower();

        if (massUnits.Contains(u))
        {
            label = "$/100g";
            if (u == "mg") baseQty = (decimal)(format / 1000.0);
            else if (u == "g") baseQty = (decimal)format;
            else if (u == "kg") baseQty = (decimal)(format * 1000.0);
            else if (u == "lb") baseQty = (decimal)(format * 453.59237);
            else if (u == "oz") baseQty = (decimal)(format * 28.3495231);
            else baseQty = (decimal)format;

            return (baseQty == 0 ? 0 : Math.Round(price / baseQty * 100m, 3), label);
        }
        else if (volUnits.Contains(u))
        {
            label = "$/100ml";
            if (u == "ml") baseQty = (decimal)format;
            else if (u == "l") baseQty = (decimal)(format * 1000.0);
            else if (u == "fl oz") baseQty = (decimal)(format * 29.5735296);
            else baseQty = (decimal)format;

            return (baseQty == 0 ? 0 : Math.Round(price / baseQty * 100m, 3), label);
        }
        else
        {
            return (Math.Round(price / (decimal)format, 3), label);
        }
    }
}
