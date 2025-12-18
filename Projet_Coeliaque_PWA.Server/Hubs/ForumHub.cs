// PATH: Projet_Coeliaque_PWA.Server/Hubs/ForumHub.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Hubs
{
    /// <summary>
    /// Real-time hub for forum threads.
    /// Clients join a group per thread: "thread-{id}".
    /// The server broadcasts events such as PostCreated, PostUpdated, PostDeleted, ThreadUpdated.
    /// </summary>
    [Authorize] // you can relax this if you want anonymous read-only
    public class ForumHub : Hub
    {
        public Task JoinThread(int threadId)
        {
            return Groups.AddToGroupAsync(Context.ConnectionId, $"thread-{threadId}");
        }

        public Task LeaveThread(int threadId)
        {
            return Groups.RemoveFromGroupAsync(Context.ConnectionId, $"thread-{threadId}");
        }
    }
}
