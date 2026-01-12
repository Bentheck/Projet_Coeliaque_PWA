using System;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Projet_Coeliaque_PWA.Server.Infrastructure
{
    public interface IBackgroundTaskQueue
    {
        ValueTask QueueAsync(Func<CancellationToken, Task> workItem);
        ValueTask<Func<CancellationToken, Task>> DequeueAsync(CancellationToken ct);
    }

    public class BackgroundTaskQueue : IBackgroundTaskQueue
    {
        private readonly Channel<Func<CancellationToken, Task>> _queue =
            Channel.CreateUnbounded<Func<CancellationToken, Task>>(
                new UnboundedChannelOptions
                {
                    SingleReader = true,
                    SingleWriter = false
                });

        public ValueTask QueueAsync(Func<CancellationToken, Task> workItem)
        {
            if (workItem is null) throw new ArgumentNullException(nameof(workItem));
            return _queue.Writer.WriteAsync(workItem);
        }

        public ValueTask<Func<CancellationToken, Task>> DequeueAsync(CancellationToken ct)
            => _queue.Reader.ReadAsync(ct);
    }
}
