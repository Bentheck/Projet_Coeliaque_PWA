using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Threading.Tasks;

namespace Projet_coeliaque.Helper
{
    public static class MembershipSessionHelper
    {
        public static async Task<IActionResult> EnsureMembershipOrRedirectAsync(
            PageModel pageModel, // or pass HttpContext + Url/Page as needed
            string userId,
            IMembershipService membershipService)
        {
            var status = pageModel.HttpContext.Session.GetString("MembershipStatus");
            if (string.IsNullOrEmpty(status))
            {
                bool isActive = await membershipService.HasActiveMembershipAsync(userId);
                status = isActive ? "Active" : "Inactive";
                pageModel.HttpContext.Session.SetString("MembershipStatus", status);
            }
            if (status == "Active")
                return null; // Indicate "continue"
                             // Otherwise, redirect!
            return pageModel.RedirectToPage("/Subscribe/Index", new { area = "", returnUrl = pageModel.Request.Path });
        }
    }
}
