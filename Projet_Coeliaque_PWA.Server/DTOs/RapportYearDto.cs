public class RapportYearDto
{
    public int Year { get; set; }
    public bool ReportGenerated { get; set; }
}

public class RapportDisplayDto
{
    public List<ProductComparisonRowDto> ReportRows { get; set; } = new();
    public string UserName { get; set; }
    public decimal TotalSousTotalProduit { get; set; }

    public List<string> RemovedRowKeys { get; set; } = new();
    public int AdultCount { get; set; } = 1;
}

public class AdultCountUpdateDto
{
    public int AdultCount { get; set; } = 1;
}

public class ProductComparisonRowDto
{
    public string TypeItem { get; set; }
    public string NomSansGluten { get; set; }
    public double QuantiteSansGluten { get; set; }
    public double FormatSansGluten { get; set; }
    public string UniteSansGluten { get; set; }
    public decimal PrixSansGluten { get; set; }

    public string? MarqueAvecGluten { get; set; }
    public string? NomAvecGluten { get; set; }
    public double? FormatAvecGluten { get; set; }
    public string? UniteAvecGluten { get; set; }
    public decimal? PrixAvecGluten { get; set; }

    public decimal PrixPar100SansGluten { get; set; }
    public decimal PrixPar100AvecGluten { get; set; }
    public decimal DiffPar100 { get; set; }
    public decimal SousTotalProduit { get; set; }
    public string PrixPar100Unit { get; set; }

    public string RowKey { get; set; } = "";
}
