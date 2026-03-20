using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Projet_Coeliaque_PWA.Server.Controllers;
using Projet_Coeliaque_PWA.Server.Data;
using Projet_Coeliaque_PWA.Server.DTOs;
using Projet_Coeliaque_PWA.Server.Models;
using Xunit;

namespace Projet_Coeliaque_PWA.Server.Tests
{
    public sealed class RecipesControllerTests
    {
        [Fact]
        public async Task GetById_ReturnsNotFound_WhenRecipeBelongsToAnotherUser()
        {
            var dbName = Guid.NewGuid().ToString("N");
            await using var db = CreateDb(dbName);

            var recipe = new Recipe
            {
                OwnerUserId = "owner-a",
                Title = "Owned recipe",
                Slug = "owned-recipe",
                InstructionsJson = "[\"step\"]",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            db.Recipes.Add(recipe);
            await db.SaveChangesAsync();

            var controller = new RecipesController(db);
            SetUser(controller, "owner-b");

            var response = await controller.GetById(recipe.Id);

            Assert.IsType<NotFoundResult>(response.Result);
        }

        [Fact]
        public async Task Search_RespectsIncludeAndExcludeIngredientFilters()
        {
            var dbName = Guid.NewGuid().ToString("N");
            await using var db = CreateDb(dbName);

            var owner = "owner-1";
            var now = DateTime.UtcNow;

            var apple = new Ingredient { Name = "Apple", NormalizedName = "apple", CreatedAt = now };
            var nut = new Ingredient { Name = "Nut", NormalizedName = "nut", CreatedAt = now };
            var cinnamon = new Ingredient { Name = "Cinnamon", NormalizedName = "cinnamon", CreatedAt = now };

            db.Ingredients.AddRange(apple, nut, cinnamon);
            await db.SaveChangesAsync();

            var recipeKeep = new Recipe
            {
                OwnerUserId = owner,
                Title = "Apple cinnamon pie",
                Slug = "apple-cinnamon-pie",
                InstructionsJson = "[\"Mix\",\"Bake\"]",
                CreatedAt = now,
                UpdatedAt = now
            };

            var recipeDrop = new Recipe
            {
                OwnerUserId = owner,
                Title = "Apple nut snack",
                Slug = "apple-nut-snack",
                InstructionsJson = "[\"Mix\"]",
                CreatedAt = now,
                UpdatedAt = now
            };

            db.Recipes.AddRange(recipeKeep, recipeDrop);
            await db.SaveChangesAsync();

            db.RecipeIngredients.AddRange(
                new RecipeIngredient
                {
                    RecipeId = recipeKeep.Id,
                    IngredientId = apple.Id,
                    SortOrder = 1
                },
                new RecipeIngredient
                {
                    RecipeId = recipeKeep.Id,
                    IngredientId = cinnamon.Id,
                    SortOrder = 2
                },
                new RecipeIngredient
                {
                    RecipeId = recipeDrop.Id,
                    IngredientId = apple.Id,
                    SortOrder = 1
                },
                new RecipeIngredient
                {
                    RecipeId = recipeDrop.Id,
                    IngredientId = nut.Id,
                    SortOrder = 2
                }
            );
            await db.SaveChangesAsync();

            var controller = new RecipesController(db);
            SetUser(controller, owner);

            var response = await controller.Search(
                q: null,
                includeIngredientIds: apple.Id.ToString(),
                excludeIngredientIds: nut.Id.ToString(),
                requireAll: true,
                page: 1,
                pageSize: 20,
                sort: "relevance",
                maxTotalTime: null,
                favoritesOnly: false,
                favoritesFirst: false);

            var ok = Assert.IsType<OkObjectResult>(response.Result);
            var dto = Assert.IsType<RecipeSearchResponseDto>(ok.Value);

            var item = Assert.Single(dto.Items);
            Assert.Equal(recipeKeep.Id, item.Id);
        }

        [Fact]
        public void Controller_RequiresActiveMembershipPolicy()
        {
            var attr = typeof(RecipesController)
                .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
                .Cast<AuthorizeAttribute>()
                .FirstOrDefault();

            Assert.NotNull(attr);
            Assert.Equal("ActiveMembership", attr!.Policy);
        }

        private static ApplicationDbContext CreateDb(string dbName)
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(dbName)
                .Options;

            return new ApplicationDbContext(options);
        }

        private static void SetUser(ControllerBase controller, string userId)
        {
            var identity = new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, userId) },
                authenticationType: "TestAuth");

            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(identity)
                }
            };
        }
    }
}
