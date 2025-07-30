public class Membership
{
    public int Id { get; set; }
    public string UserId { get; set; }           // Foreign key to IdentityUser
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    public bool IsActive =>
        DateTime.UtcNow >= StartDate && DateTime.UtcNow <= EndDate;
}
