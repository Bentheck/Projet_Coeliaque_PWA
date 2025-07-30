public static class UnitConversionHelper
{
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