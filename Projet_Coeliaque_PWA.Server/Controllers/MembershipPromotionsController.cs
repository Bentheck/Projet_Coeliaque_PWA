using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Infrastructure;
using Projet_Coeliaque_PWA.Server.Models;
using Projet_Coeliaque_PWA.Server.Services;

namespace Projet_Coeliaque_PWA.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/membership/promotions")]
    [ModuleGate("Membership")]
    public class MembershipPromotionsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMembershipService _membershipService;
        private readonly IAuditLogService _audit;

        public MembershipPromotionsController(
            ApplicationDbContext db,
            IMembershipService membershipService,
            IAuditLogService audit)
        {
            _db = db;
            _membershipService = membershipService;
            _audit = audit;
        }

        [HttpGet("welcome-offer")]
        [ProducesResponseType(typeof(PromotionWelcomeOfferDto), 200)]
        [ProducesResponseType(204)]
        [ProducesResponseType(401)]
        public async Task<IActionResult> GetWelcomeOffer()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var offer = await FindActiveMembershipTrialOfferAsync();
            if (offer == null)
                return NoContent();

            var eligibility = await GetEligibilityAsync(userId, offer.Id);
            if (!eligibility.IsEligible)
                return NoContent();

            return Ok(ToWelcomeOfferDto(offer));
        }

        [HttpPost("claim/{promotionEventId:guid}")]
        [ProducesResponseType(typeof(ClaimPromotionOfferResultDto), 200)]
        [ProducesResponseType(401)]
        [ProducesResponseType(404)]
        [ProducesResponseType(409)]
        public async Task<IActionResult> ClaimWelcomeOffer(Guid promotionEventId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized();

            var offer = await FindActiveMembershipTrialOfferAsync(promotionEventId);
            if (offer == null)
                return NotFound();

            var eligibility = await GetEligibilityAsync(userId, offer.Id);
            if (!eligibility.IsEligible)
                return Conflict(new { error = eligibility.Reason ?? "Offer is not available." });

            var now = DateTime.UtcNow;
            var startUtc = now;
            var endUtc = now.AddDays(offer.MembershipDurationDays);

            var membership = new Membership
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                StartDate = startUtc,
                EndDate = endUtc
            };

            var claim = new PromotionEventClaim
            {
                Id = Guid.NewGuid(),
                PromotionEventId = offer.Id,
                UserId = userId,
                ClaimedUtc = now,
                GrantedMembershipStartUtc = startUtc,
                GrantedMembershipEndUtc = endUtc
            };

            _db.Memberships.Add(membership);
            _db.PromotionEventClaims.Add(claim);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(
                User,
                "Membership.Promotion.Claimed",
                offer.Id.ToString(),
                new
                {
                    offer.Name,
                    Type = offer.Type.ToString(),
                    offer.MembershipDurationDays,
                    membership.StartDate,
                    membership.EndDate
                });

            return Ok(new ClaimPromotionOfferResultDto(
                offer.Id,
                membership.StartDate,
                membership.EndDate
            ));
        }

        private async Task<PromotionEvent?> FindActiveMembershipTrialOfferAsync(Guid? specificId = null)
        {
            var now = DateTime.UtcNow;

            var query = _db.PromotionEvents
                .AsNoTracking()
                .Where(x =>
                    x.Type == PromotionEventType.MembershipTrialDays &&
                    x.IsEnabled &&
                    (!x.StartsUtc.HasValue || x.StartsUtc.Value <= now) &&
                    (!x.EndsUtc.HasValue || x.EndsUtc.Value >= now));

            if (specificId.HasValue)
            {
                query = query.Where(x => x.Id == specificId.Value);
            }

            return await query
                .OrderByDescending(x => x.StartsUtc ?? x.CreatedUtc)
                .ThenByDescending(x => x.UpdatedUtc)
                .FirstOrDefaultAsync();
        }

        private async Task<(bool IsEligible, string? Reason)> GetEligibilityAsync(string userId, Guid promotionEventId)
        {
            if (await _membershipService.HasActiveMembershipAsync(userId))
            {
                return (false, "You already have an active membership.");
            }

            var hasMembershipHistory = await _db.Memberships
                .AsNoTracking()
                .AnyAsync(x => x.UserId == userId);

            if (hasMembershipHistory)
            {
                return (false, "This welcome offer is only available before a first membership is created.");
            }

            var alreadyClaimed = await _db.PromotionEventClaims
                .AsNoTracking()
                .AnyAsync(x => x.PromotionEventId == promotionEventId && x.UserId == userId);

            if (alreadyClaimed)
            {
                return (false, "This promotion has already been claimed.");
            }

            return (true, null);
        }

        private static PromotionWelcomeOfferDto ToWelcomeOfferDto(PromotionEvent offer)
            => new(
                offer.Id,
                offer.Type.ToString(),
                offer.MembershipDurationDays,
                offer.EndsUtc,
                offer.PublicTitleFr,
                offer.PublicTitleEn,
                offer.PublicDescriptionFr,
                offer.PublicDescriptionEn
            );
    }
}
