using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Threading.Tasks;

namespace Projet_coeliaque.Helper
{
    /// <summary>
    /// Utilities for caching and checking a user's membership status in the session,
    /// and redirecting to the subscription page when inactive.
    /// </summary>
    public static class MembershipSessionHelper
    {
        /// <summary>
        /// Ensures the current user has an active membership.
        /// </summary>
        /// <param name="pageModel">The current Razor <see cref="PageModel"/> (used to access <see cref="HttpContext"/> and perform redirects).</param>
        /// <param name="userId">The Identity user ID to check membership for.</param>
        /// <param name="membershipService">Service that determines whether a user has an active membership.</param>
        /// <returns>
        /// <para>
        /// <c>null</c> if the membership is active (indicates the caller can continue rendering/processing);
        /// otherwise, an <see cref="IActionResult"/> that redirects to <c>/Subscribe/Index</c> with a <c>returnUrl</c> back to the current page.
        /// </para>
        /// </returns>
        /// <remarks>
        /// <list type="bullet">
        /// <item>
        /// If the <c>MembershipStatus</c> value is missing from session, the method will query <paramref name="membershipService"/> and cache
        /// either <c>"Active"</c> or <c>"Inactive"</c> in the session for subsequent requests.
        /// </item>
        /// <item>
        /// Callers should check for <c>null</c> return and proceed; otherwise, immediately return the redirect result.
        /// </item>
        /// </list>
        /// </remarks>
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
