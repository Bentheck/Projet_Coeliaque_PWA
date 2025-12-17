public interface IMembershipService
{
    Task<Membership?> GetCurrentMembershipAsync(string userId);
    Task<bool> HasActiveMembershipAsync(string userId);
}